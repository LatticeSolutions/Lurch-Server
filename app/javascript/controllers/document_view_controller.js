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
// Clicking a math atom shows its read-only source and output in a modal, as
// the editor does for atoms it can't edit.
// The frame is sandboxed with allow-same-origin but not allow-scripts, so
// all of this runs here, reaching into the frame's document from outside.
export default class extends Controller {
  static targets = [ "frame", "checkmark", "mathDialog", "mathDialogTitle", "mathSource", "mathPreview" ]

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
    this.setUpDocument?.body?.removeEventListener( "click", this.onMathClick )
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

    const [ { Atom }, expressions, , , , { represent }, { Message }, { setHeader }, { LurchDocument }, { getConverter } ] = await Promise.all( [
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
      import( "/lurchmath/lurch-document.js" ),
      import( "/lurchmath/math-live.js" )
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
    // (It can also throw for a moment: MathLive's MathfieldElement appears
    // before its compute engine, which the converter uses, has loaded.)
    const converterWorks = () => {
      try {
        return represent( "x", "lurchNotation" ) !== undefined
      } catch {
        return false
      }
    }
    while ( !converterWorks() ) await sleep( 50 )
    await sleep( 100 )

    this.renderMath( doc, Atom )
    const editor = this.makeEditor( doc )
    this.installMathClicks( doc, editor, { Atom, converter: await getConverter() } )
    this.validate( editor, { Atom, Message, setHeader } )
  }

  // Show a math atom's source when it's clicked (see showMathSource()). The
  // frame can't run scripts, so the listener is added from out here.
  installMathClicks( doc, editor, { Atom, converter } ) {
    const style = doc.createElement( "style" )
    style.textContent = MATH_ATOM_TYPES
      .map( type => `.lurch-atom[data-metadata_type='${JSON.stringify( type )}']` )
      .join( ", " ) + " { cursor: pointer; }"
    doc.head.appendChild( style )
    this.onMathClick = event => {
      const element = event.target.closest?.( ".lurch-atom[data-metadata_type]" )
      if ( !element ) return
      const type = JSON.parse( element.dataset.metadata_type )
      if ( MATH_ATOM_TYPES.includes( type ) )
        this.showMathSource( Atom.from( element, editor ), type, converter )
    }
    doc.body.addEventListener( "click", this.onMathClick )
  }

  // The read-only counterpart of the editor's math dialogs (see viewSource()
  // in public/lurchmath/expressions.js and expository-math.js): the atom's
  // Lurch notation (or, for expository math, LaTeX) above its rendering.
  showMathSource( atom, type, converter ) {
    let source = "", latex = null
    try {
      if ( type === "expression" ) {
        source = atom.loadAdvancedModeData().lurchNotation
        latex = converter( source, "lurch", "latex" )
      } else {
        source = latex = atom.getMetadata( "latex" )
      }
    } catch ( error ) {
      console.error( error )
    }
    this.mathDialogTitleTarget.textContent =
      type === "expression" ? "View Lurch math expression" : "View LaTeX source"
    this.mathSourceTarget.value = source ?? ""
    this.mathSourceTarget.rows = Math.max( 1, ( source ?? "" ).split( "\n" ).length )
    this.mathPreviewTarget.replaceChildren()
    if ( typeof latex === "string" ) {
      const field = new window.MathfieldElement()
      field.readOnly = true
      field.value = latex
      field.style.width = "100%"
      field.style.border = "0"
      this.mathPreviewTarget.appendChild( field )
    }
    this.mathDialogTarget.showModal()
  }

  closeMathDialog() {
    this.mathDialogTarget.close()
  }

  // Clicks on the dialog element itself (not its contents) are on the backdrop.
  closeMathDialogOnBackdrop( event ) {
    if ( event.target === this.mathDialogTarget ) this.closeMathDialog()
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
