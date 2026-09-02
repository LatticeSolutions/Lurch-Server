import { Controller } from "@hotwired/stimulus"
import { LurchDocument } from "/lurchmath/lurch-document.js"
import { Dialog, CheckBoxItem, AlertItem } from "/lurchmath/dialog.js"
import { getHeader, setHeader } from "/lurchmath/header-editor.js"
import { Dependency } from "/lurchmath/dependencies.js"
import { Atom } from "/lurchmath/atoms.js"

// Renders the Lurch document editor -- a vendored, non-npm third-party
// library loaded via <script src="/lurchmath/editor.js"> as a side effect
// that sets the global `Lurch` (see bin/vendor-lurch.mjs) -- into this
// controller's own element, and wires it to this app's Rails endpoints for
// save/duplicate/context. See app/views/documents/show.html.erb.
/* global Lurch */
export default class extends Controller {
  static values = {
    id: String,
    title: String,
    canEdit: Boolean,
    content: String,
    context: Array
  }

  connect() {
    this.currentContextIds = this.contextValue.map( doc => doc.id )
    this.autosaveTimer = null

    // `Lurch` is set as a side effect of the sibling
    // <script type="module" src="/lurchmath/editor.js"> tag. Module scripts
    // execute in document order but this controller can still connect
    // before that has finished, so wait for the window "load" event, which
    // only fires once every subresource (including that script) is done.
    if ( document.readyState === "complete" ) {
      this.startEditor()
    } else {
      window.addEventListener( "load", () => this.startEditor(), { once: true } )
    }
  }

  disconnect() {
    if ( this.autosaveTimer ) clearInterval( this.autosaveTimer )
  }

  startEditor() {
    Lurch.createApp( this.element, {
      appRoot: "/lurchmath",
      preventLeaving: false,
      autoSaveEnabled: false,
      // editor.js unconditionally appends to menuData.help.items, which is
      // only initialized if at least one help page is supplied.
      helpPages: [ { title: "Getting Started", url: "https://about.lurch.plus/getting-started" } ],
      // Always show the "meaning" (boxed) view of environments, rather than
      // the vendor default "minimal" presentation view.
      appDefaults: { "default shell style": "boxed" },
      documentDefaults: { "shell style": "boxed" },
      // Add the "validate" button (a green checkmark, already wired to the
      // same handler as the Document menu's "Show/Hide validity" item) to
      // the stock toolbar.
      toolbarData: "undo redo | "
        + "styles bold italic | "
        + "alignleft aligncenter alignright outdent indent | "
        + "numlist bullist | "
        + "validate",
      menuData: {
        file: {
          title: "File",
          items: "newlurchdocument opendocument savedocument duplicatedocument | print | closedocument"
        },
        document: {
          title: "Document",
          items: "viewcontext"
            + ( this.canEditValue ? " editdependencyurls" : "" )
            + " validate | docsettings"
        }
      }
    } ).then( editor => {
      this.editor = editor
      this.setUpEditor()
    } )
  }

  setUpEditor() {
    const editor = this.editor

    editor.on( "init", () => {
      new LurchDocument( editor ).setDocument( this.contentValue )
      this.applyContext( this.contextValue )
      if ( !this.canEditValue ) {
        editor.mode.set( "readonly" )
      } else {
        this.startAutosave()
      }
    } )

    this.registerMenuItems()
  }

  // Periodically save to the server while there are unsaved changes, so
  // work isn't lost if the user forgets to save manually. Stays silent on
  // success; after 3 consecutive failures, warns the user once that
  // autosave isn't working (the counter then resets on the next success, so
  // a later failing streak warns again).
  startAutosave() {
    let autosaveFailures = 0
    this.autosaveTimer = setInterval( () => {
      if ( !this.editor.isDirty() ) return
      this.saveDocument().then( () => {
        autosaveFailures = 0
      } ).catch( error => {
        console.error( error )
        autosaveFailures++
        if ( autosaveFailures === 3 )
          Dialog.notify( this.editor, "error",
            "Autosave is not working. Your changes are not being saved -- please save manually." )
      } )
    }, 10000 )
  }

  // Rebuild the document header's Dependency atoms from a list of
  // { id, title, owner, content } context documents, replacing whatever
  // dependency atoms are currently there.
  applyContext( documents ) {
    const editor = this.editor
    let header = getHeader( editor )
    if ( !header ) {
      setHeader( editor, "" )
      header = getHeader( editor )
    }
    Dependency.topLevelDependenciesIn( header, editor ).forEach(
      atom => atom.element.remove() )
    documents.forEach( doc => {
      const dependency = Atom.newBlock( editor, "", {
        type: "dependency",
        description: "none",
        filename: doc.title,
        source: "Public Documents",
        autoRefresh: false
      } )
      dependency.setHTMLMetadata( "content", doc.content )
      dependency.update()
      header.appendChild( dependency.element )
    } )
    setHeader( editor, header.innerHTML )
    editor.getBody().querySelector( "#context" )?.remove()
  }

  saveDocument() {
    const editor = this.editor
    const content = new LurchDocument( editor ).getDocument( "" )
    return fetch( `/documents/${this.idValue}.json`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-CSRF-Token": this.csrfToken()
      },
      body: JSON.stringify( { document: { content } } )
    } ).then( response => {
      if ( !response.ok ) throw new Error( response.statusText )
      editor.setDirty( false )
    } )
  }

  ensureWorkIsSaved() {
    const editor = this.editor
    return editor.isDirty()
      ? Dialog.areYouSure( editor, "You will lose any unsaved work.  Continue anyway?" )
      : Promise.resolve( true )
  }

  csrfToken() {
    return document.querySelector( 'meta[name="csrf-token"]' ).content
  }

  registerMenuItems() {
    const editor = this.editor

    editor.ui.registry.addMenuItem( "newlurchdocument", {
      text: "New", icon: "new-document", tooltip: "New document", shortcut: "Alt+N",
      onAction: () => this.ensureWorkIsSaved().then( ok => {
        if ( ok ) window.location.href = "/documents/new"
      } )
    } )
    editor.ui.registry.addMenuItem( "opendocument", {
      text: "Open", tooltip: "Open document", shortcut: "Alt+O",
      onAction: () => this.ensureWorkIsSaved().then( ok => {
        if ( ok ) window.location.href = "/documents"
      } )
    } )
    editor.ui.registry.addMenuItem( "savedocument", {
      text: "Save", tooltip: "Save document", shortcut: "Alt+S",
      onAction: () => this.saveDocument().then( () => {
        Dialog.notify( editor, "success", "Document saved." )
      } ).catch( error => {
        Dialog.notify( editor, "error", "Could not save the document." )
        console.error( error )
      } )
    } )
    editor.ui.registry.addMenuItem( "duplicatedocument", {
      text: "Duplicate", icon: "duplicate", tooltip: "Save a copy as a new document",
      onAction: () => this.duplicateDocument()
    } )
    editor.ui.registry.addMenuItem( "closedocument", {
      text: "Close", icon: "close", tooltip: "Close this document and return to the homepage",
      onAction: () => this.ensureWorkIsSaved().then( ok => {
        if ( ok ) window.location.href = "/documents"
      } )
    } )

    if ( this.canEditValue ) {
      editor.ui.registry.addMenuItem( "editdependencyurls", {
        text: "Add or remove context", tooltip: "Choose which public documents this one depends on", icon: "edit-block",
        onAction: () => this.openContextPicker()
      } )
    }
  }

  duplicateDocument() {
    const editor = this.editor
    const content = new LurchDocument( editor ).getDocument( "" )
    fetch( "/documents.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-CSRF-Token": this.csrfToken()
      },
      body: JSON.stringify( { document: { title: `Copy of ${this.titleValue}`, content } } )
    } ).then( response => {
      if ( !response.ok ) throw new Error( response.statusText )
      return response.json()
    } ).then( created => {
      window.location.href = `/documents/${created.id}`
    } ).catch( error => {
      Dialog.notify( editor, "error", "Could not duplicate the document." )
      console.error( error )
    } )
  }

  // Replace the vendor's "Add or remove context" dialog (file-system/upload/
  // URL-based) with one offering only this app's public documents.
  openContextPicker() {
    const editor = this.editor
    fetch( "/documents/public.json", {
      headers: { "Accept": "application/json" }
    } ).then( response => {
      if ( !response.ok ) throw new Error( response.statusText )
      return response.json()
    } ).then( publicDocuments => {
      // A document can't depend on itself.
      publicDocuments = publicDocuments.filter( doc => doc.id !== this.idValue )
      const dialog = new Dialog( "Add or remove context", editor )
      dialog.json.size = "medium"
      if ( publicDocuments.length == 0 ) {
        dialog.addItem( new AlertItem( "warn", "No public documents are available yet." ) )
      } else {
        publicDocuments.forEach( doc => dialog.addItem(
          new CheckBoxItem( doc.id, `${doc.title} (${doc.owner})` ) ) )
        dialog.setInitialData( Object.fromEntries( publicDocuments.map(
          doc => [ doc.id, this.currentContextIds.includes( doc.id ) ] ) ) )
      }
      dialog.show().then( userHitOK => {
        if ( !userHitOK ) return
        const selectedIds = publicDocuments.filter(
          doc => dialog.get( doc.id ) ).map( doc => doc.id )
        // Persist the choice immediately, independent of the general "Save"
        // flow (which only covers this document's own title/content).
        fetch( `/documents/${this.idValue}/context.json`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-CSRF-Token": this.csrfToken()
          },
          body: JSON.stringify( { document: { context_document_ids: selectedIds } } )
        } ).then( response => {
          if ( !response.ok ) throw new Error( response.statusText )
          this.currentContextIds = selectedIds
          // Refresh the live header without requiring a page reload.
          return Promise.all( selectedIds.map( id =>
            fetch( `/documents/${id}.json`, {
              headers: { "Accept": "application/json" }
            } ).then( response => response.json() )
          ) )
        } ).then( selectedDocuments => {
          this.applyContext( selectedDocuments )
          Dialog.notify( editor, "success", "Updated this document's context." )
        } ).catch( error => {
          Dialog.notify( editor, "error", "Could not update this document's context." )
          console.error( error )
        } )
      } )
    } ).catch( error => {
      Dialog.notify( editor, "error", "Could not load public documents." )
      console.error( error )
    } )
  }
}
