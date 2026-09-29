import { Controller } from "@hotwired/stimulus"
import { contextHeaderHTML } from "../lurch_context"

// Atom types whose saved HTML is MathLive markup that must be redrawn; see
// renderMath() below.
const MATH_ATOM_TYPES = [ "expression", "expositorymath" ]

const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) )

// Drives the read-only view's <iframe srcdoc> (see
// app/views/documents/show.html.erb): redraws its math, validates it once
// (showing a checkmark by the title if every statement is valid), and sizes
// the frame to fit its content so the page scrolls rather than the frame.
// The frame is sandboxed with allow-same-origin but not allow-scripts, so
// all of this runs here, reaching into the frame's document from outside.
export default class extends Controller {
  static targets = [ "frame", "checkmark" ]

  static values = {
    context: Array,
    metadata: String
  }

  connect() {
    this.onLoad = () => this.setUp()
    this.frameTarget.addEventListener( "load", this.onLoad )
    if ( this.frameTarget.contentDocument?.readyState === "complete" ) this.setUp()
  }

  disconnect() {
    this.frameTarget.removeEventListener( "load", this.onLoad )
    this.observer?.disconnect()
    this.stopValidation?.()
  }

  setUp() {
    const doc = this.frameTarget.contentDocument
    if ( !doc?.body || doc === this.setUpDocument ) return
    this.setUpDocument = doc
    this.observe( doc.body )
    this.renderAndValidate( doc ).catch( error => console.error( error ) )
  }

  // Refit whenever the content's size changes (e.g. web fonts loading, math
  // being redrawn, or the window being resized and the text rewrapping).
  observe( body ) {
    this.observer?.disconnect()
    this.observer = new ResizeObserver( () => this.fit() )
    this.observer.observe( body )
    this.fit()
  }

  // Measure the body itself rather than the root's scrollHeight, which never
  // drops below the frame's current height and so could only ever grow.
  fit() {
    const body = this.frameTarget.contentDocument?.body
    if ( !body ) return
    const style = getComputedStyle( body )
    const height = body.offsetHeight + parseFloat( style.marginTop ) + parseFloat( style.marginBottom )
    this.frameTarget.style.height = `${Math.ceil( height )}px`
  }

  async renderAndValidate( doc ) {
    if ( !doc.querySelector( ".lurch-atom" ) ) return

    const [ { Atom }, expressions, , , , { represent }, { Message }, { setHeader }, { LurchDocument } ] = await Promise.all( [
      import( "/lurchmath/atoms.js" ),
      import( "/lurchmath/expressions.js" ),
      // These register the remaining Atom subclasses, without which
      // Atom.from() throws "Unknown atom type" for their atoms.
      import( "/lurchmath/expository-math.js" ),
      import( "/lurchmath/dependencies.js" ),
      import( "/lurchmath/shells.js" ),
      import( "/lurchmath/notation.js" ),
      import( "/lurchmath/validation-messages.js" ),
      import( "/lurchmath/header-editor.js" ),
      import( "/lurchmath/lurch-document.js" )
    ] )
    // Match the editor's `documentDefaults` (see document_editor_controller.js):
    // LurchDocument re-applies the frame body's shell-style class from the
    // document settings whenever its metadata changes (as in validate()).
    LurchDocument.settingsMetadata.metadataFor( "shell style" ).defaultValue = "boxed"
    // Expression atoms in beginner mode convert via a module-level converter
    // that only expressions.install() sets up; it otherwise just adds a menu
    // item, hence the stub editor.
    expressions.install( { ui: { registry: { addMenuItem() {} } } } )
    // Each vendor module loads its MathLive converter separately, each via its
    // own getConverter() call that polls every 100ms for MathLive to finish
    // loading, and until then renders math as "undefined" (and can't parse
    // it for validation). So wait until notation.js's converter works, then
    // one more polling interval for expressions.js's (beginner mode only).
    while ( represent( "x", "lurchNotation" ) === undefined ) await sleep( 50 )
    await sleep( 100 )

    this.renderMath( doc, Atom )
    this.validate( this.makeEditor( doc ), { Atom, Message, setHeader } )
  }

  // Saved content's MathLive markup is incomplete: TinyMCE drops empty
  // elements when serializing, including MathLive's empty `ML__pstrut`
  // spacers, which misplaces superscripts, fractions, etc. The editor gets
  // away with this because it redraws every atom on load, so do the same
  // here, with the vendor's own atom classes (which work on plain DOM
  // elements; they only need a TinyMCE editor for editing, not update()).
  renderMath( doc, Atom ) {
    Array.from( doc.querySelectorAll( ".lurch-atom[data-metadata_type]" ) )
      .filter( element => MATH_ATOM_TYPES.includes( JSON.parse( element.dataset.metadata_type ) ) )
      .forEach( element => {
        try {
          Atom.from( element ).update()
        } catch ( error ) {
          // Leave the saved markup in place; it's close, just misaligned.
          console.error( error )
        }
      } )
  }

  // Just enough of a TinyMCE editor for the vendor's validation code
  // (Message.document(), Atom, LurchDocument, getHeader(), lookup()). Every
  // element it creates, including the document's metadata and its context
  // documents' content, lives in the sandboxed frame's document, where
  // inline event handlers can't run.
  makeEditor( doc ) {
    const saved = new DOMParser().parseFromString( this.metadataValue, "text/html" )
      .querySelector( "#metadata" )
    let lurchMetadata
    if ( saved ) {
      lurchMetadata = doc.importNode( saved, true )
    } else {
      lurchMetadata = doc.createElement( "div" )
      lurchMetadata.id = "metadata"
      lurchMetadata.style.display = "none"
    }
    return { contentDocument: doc, dom: { doc }, getBody: () => doc.body, lurchMetadata }
  }

  // Validate the document once, the same way the editor's validate button
  // does (see public/lurchmath/validation.js), replacing its saved feedback.
  validate( editor, { Atom, Message, setHeader } ) {
    // As in the editor, the header holds the context documents, freshly
    // built from the server's current context tree.
    setHeader( editor, contextHeaderHTML( editor, this.contextValue ) )
    Atom.allIn( editor ).forEach( atom => atom.setValidationResult( null ) )

    const worker = new Worker( "/lurchmath/validation-worker.js", { type: "module" } )
    // Parse errors are posted to this window rather than by the worker.
    const onMessage = event => {
      if ( typeof event.data !== "object" || !event.data ) return
      const message = new Message( event )
      if ( message.is( "feedback" ) || message.is( "error" ) ) {
        if ( message.element && Atom.isAtomElement( message.element ) )
          Atom.from( message.element, editor ).applyValidationMessage( message )
      } else if ( message.is( "done" ) ) {
        this.showResult( editor.dom.doc )
        this.stopValidation()
      }
    }
    this.stopValidation = () => {
      worker.terminate()
      window.removeEventListener( "message", onMessage )
      this.stopValidation = null
    }
    worker.addEventListener( "message", onMessage )
    window.addEventListener( "message", onMessage )

    Message.document( editor, "putdown" ).send( worker )
  }

  // Show the title's checkmark iff validation marked at least one statement
  // and marked every one valid. (Rules, assumptions and declarations get no
  // marker; an atom's marker can carry several feedback-marker-* classes.)
  showResult( doc ) {
    const classes = Array.from( doc.body.querySelectorAll( "[class*=feedback-marker]" ) )
      .flatMap( marker => Array.from( marker.classList ) )
      .filter( name => name.startsWith( "feedback-marker-" ) )
    this.checkmarkTarget.hidden =
      !( classes.length > 0 && classes.every( name => name === "feedback-marker-valid" ) )
  }
}
