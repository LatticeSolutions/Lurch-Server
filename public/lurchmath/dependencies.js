
/**
 * This file installs one tool into the user interface, a menu item for
 * refreshing dependecy-type atoms that are in the document or its header.
 * It also defines the {@link Dependency} subclass of {@link Atom}, but does not
 * permit users to insert any into their document or edit them.  To do so, see
 * the file `header-editor.js`, which defines tools for manipulating the list
 * of dependencies stored invisibly in the document header.
 * 
 * A dependency atom will have three important properties:
 * 
 *  * A `"filename"` specifying where the dependency was loaded from.
 *  * A `"source"` specifying which {@link FileSystem} the dependency was loaded
 *    from.  If this is the {@link WebFileSystem}, then the filename is the full
 *    URL, and such dependencies can be refreshed by reloading their content at
 *    any time.  Other dependency types cannot be refreshed.
 *  * A `"description"` metadata entry will contain whatever text the user
 *    wants to use to make the dependency easy to identify when scrolling
 *    through a document, so the reader doesn't need to open it up to know
 *    what's inside.  This is a simple piece of metadata, not HTML-type
 *    metadata; the difference between the two is documented
 *    {@link module:Atoms.Atom#getHTMLMetadata here}.
 *  * A `"content"` HTML metadata entry will contain the full content of the
 *    dependency that was loaded, or it will be absent if the atom has not yet
 *    been configured by the user.  This is a piece of HTML metadata, not simple
 *    metadata, because it will typically be large; the difference between the
 *    two is documented {@link module:Atoms.Atom#getHTMLMetadata here}.
 *  * A checkbox for whether the dependency should be refreshed every time the
 *    document is loaded.
 * 
 * @module Dependencies
 */

import { Atom, className } from './atoms.js'
import {
    simpleHTMLTable, escapeHTML, escapeLatex, editorForNode
} from './utilities.js'
import { Dialog } from './dialog.js'
import { loadFromURL } from './load-from-url.js'

/**
 * Install into a TinyMCE editor instance a new menu item: Refresh dependencies.
 * This reloads the contents of all URL-based dependencies in the document and
 * its header.
 * 
 * This assumes that the TinyMCE initialization code includes the
 * "refreshdependencies" item on one of the menus.
 * 
 * @param {tinymce.Editor} editor the TinyMCE editor instance into which the new
 *   menu item should be installed
 * @function
 */
export const install = editor => {
    editor.ui.registry.addMenuItem( 'refreshdependencies', {
        icon : 'reload',
        text : 'Refresh dependencies',
        tooltip : 'Refresh all dependencies',
        onAction : () => {
            editor.setProgressState( true )
            Promise.all( [
                Dependency.refreshAllIn( editor.lurchMetadata ),
                Dependency.refreshAllIn( editor.getBody() )
            ] ).then( () => {
                editor.setProgressState( false )
                Dialog.notify( editor, 'success', 'Refreshed all dependencies.' )
            } ).catch( error => {
                editor.setProgressState( false )
                Dialog.notify( editor, 'error', error )
            } )
        }
    } )
}

// Internal use only: Show a dialog that lets the user edit the dependency's
// description, or change its content by loading any file over top of the old
// content, or preview the current content in a new window.
export class Dependency extends Atom {

    static subclassName = Atom.registerSubclass( 'dependency', Dependency )
    
    /**
     * Update the HTML representation of this dependency.  A dependency's
     * visual representation is just an uneditable DIV in the document that
     * looks like a box, says it's a dependency, and includes the description
     * the user provided when editing the dependency.  The actual content of the
     * dependency does not appear in its visual representation in the document,
     * because it would typically be prohibitively large.
     */
    update () {
        this.element.style.border = 'solid 1px gray'
        this.element.style.padding = '0 1em 0 1em'
        const description = this.getMetadata( 'description' )
        const filename = this.getMetadata( 'filename' )
        const source = this.getMetadata( 'source' )
        this.fillChild( 'body', simpleHTMLTable(
            'Imported dependency document',
            [ 'Description:', `<tt>${escapeHTML( description )}</tt>` ],
            [ 'Filename:', `<tt>${escapeHTML( filename )}</tt>` ],
            [ 'Source:', escapeHTML( source ) ],
            [ 'Auto-refresh:', this.getMetadata( 'autoRefresh' ) ? 'yes' : 'no' ]
        ) )
    }

    /**
     * All atoms must be able to represent themselves in LaTeX form, so that the
     * document (or a portion of it) can be exporeted for use in a LaTeX editor,
     * such as Overleaf.  This function overrides the default implementation
     * with a representation suitable to dependency atoms.  It contains a single
     * line of text saying that a dependency is imported at this location,
     * followed by a bulleted list of the attributes of the dependency.
     * 
     * @returns {string} LaTeX representation of a dependency atom
     */
    toLatex () {
        return `Imported dependency document
        \\begin{enumerate}
        \\item  Description: ${escapeLatex( this.getMetadata( 'description' ) )}
        \\item  Filename: \\url{${this.getMetadata( 'filename' )}}
        \\item  Source: ${escapeLatex( this.getMetadata( 'source' ) )}
        \\item  Auto-refresh: ${this.getMetadata( 'autoRefresh' ) ? 'yes' : 'no'}
        \\end{enumerate}
        `
    }

    /**
     * Get all top-level dependency atoms inside a given DOM node.
     * 
     * @param {Node} node - the DOM node in which to find Dependency atoms to
     *   refresh
     * @param {tinymce.Editor?} editor - the TinyMCE editor in which the node
     *   sits (or it will be computed automatically if omitted)
     */
    static topLevelDependenciesIn ( node, editor ) {
        // Find all elements inside the node representing dependency atoms
        const type = JSON.stringify( Dependency.subclassName )
        const allDepElts = Array.from( node.querySelectorAll(
            `.${className}[data-metadata_type='${type}']` ) )
        // Figure out which TinyMCE instance these belong to
        if ( !editor ) editor = editorForNode( node )
        // Filter for just those that are top-level (not inside others)
        return allDepElts.filter( depElt =>
            !allDepElts.some( other =>
                other !== depElt && other.contains( depElt ) )
        ).map( depElt => Atom.from( depElt, editor ) )
    }

    /**
     * Find all dependency atoms in the specified DOM node and refresh them.
     * The refreshing action on an individual dependency atom is done by the
     * {@link module:Dependencies.Dependency#refresh refresh()} function.
     * 
     * If the second parameter is true, then not all URL-based dependencies are
     * refreshed, but only those whose "auto-refresh" checkbox is checked.
     * 
     * This process is recursive, in that after all dependency atoms have been
     * refreshed, it will call itself again to refresh all dependency atoms
     * found inside any of the dependency atoms that were just refreshed.
     * 
     * @param {Node} node - the DOM node in which to find Dependency atoms to
     *   refresh
     * @param {boolean} autoRefreshOnly - whether to refresh only those atoms
     *   representing dependencies whose "auto-refresh" checkbox is checked
     * @returns {Promise} a promise that resolves if all refreshable dependency
     *   atoms successfully refreshed, and that rejects if any of them failed to
     *   refresh (e.g., page no longer at that URL, or a network error, etc.)
     * @see {@link module:Dependencies.Dependency#refresh refresh()}
     */
    static refreshAllIn ( node, autoRefreshOnly = false ) {
        return Promise.all( Dependency.topLevelDependenciesIn( node ).map(
            dependency => dependency.refresh( autoRefreshOnly ) ) )
    }

    /**
     * Refresh this dependency atom.  The auto-refresh checkbox need not be
     * checked; that is just for specifying whether this action should take
     * place every time the document loads.
     * 
     * This process is recursive, in that after the dependency atom has been
     * refreshed, it will call
     * {@link module:Dependencies.Dependency#refreshAllIn refreshAllIn()} to
     * refresh any dependencies inside the newly loaded content.  In doing so,
     * it will pass the argument of this function to specify whether that
     * recursion should apply to all URL-based dependencies, or just those whose
     * "auto-refresh" checkbox is checked.
     * 
     * @param {boolean} autoRefreshOnly - whether to ask recursive calls to
     *   apply to only dependencies whose "auto-refresh" checkbox is checked
     * @returns {Promise} a promise that resolves if the dependency was
     *   successfully refreshed, and that rejects if it failed to refresh
     *   (e.g., page no longer at that URL, or a network error, etc.)
     * @see {@link module:Dependencies.Dependency#refreshAllIn refreshAllIn()}
     */
    refresh ( autoRefreshOnly = false ) {
        return new Promise( ( resolve, reject ) => {
            // If we are not supposed to refresh this one, do nothing.
            if ( autoRefreshOnly && !this.getMetadata( 'autoRefresh' ) ) {
                resolve()
                return
            }
            // If it is not possible to refresh this one, do nothing.
            // (We do two checks here because we've used different phrases in
            // different versions of the app, and need to support legacy docs.)
            if ( this.getMetadata( 'source' ) != 'the web'
              && this.getMetadata( 'source' ) != 'web' ) {
                resolve()
                return
            }
            // We are supposed to refresh, so do so (and recur as well).
            loadFromURL( this.getMetadata( 'filename' ) ).then( content => {
                this.setHTMLMetadata( 'content', content )
                Dependency.refreshAllIn(
                    this.getHTMLMetadata( 'content' ), autoRefreshOnly
                ).then( resolve ).catch( reject )
            } ).catch( reject )
        } )
    }

}

export default { install }
