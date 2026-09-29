import { Controller } from "@hotwired/stimulus"

// Atom types whose saved HTML is MathLive markup that must be redrawn; see
// renderMath() below.
const MATH_ATOM_TYPES = [ "expression", "expositorymath" ]

// Drives the read-only view's <iframe srcdoc> (see
// app/views/documents/show.html.erb): redraws its math, and sizes the frame
// to fit its content so the page scrolls rather than the frame. The frame is
// sandboxed with allow-same-origin but not allow-scripts, so all of this runs
// here, reaching into the frame's document from outside.
export default class extends Controller {
  connect() {
    this.onLoad = () => this.setUp()
    this.element.addEventListener( "load", this.onLoad )
    if ( this.element.contentDocument?.readyState === "complete" ) this.setUp()
  }

  disconnect() {
    this.element.removeEventListener( "load", this.onLoad )
    this.observer?.disconnect()
  }

  setUp() {
    const doc = this.element.contentDocument
    if ( !doc?.body || doc === this.setUpDocument ) return
    this.setUpDocument = doc
    this.observe( doc.body )
    this.renderMath( doc ).catch( error => console.error( error ) )
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
    const body = this.element.contentDocument?.body
    if ( !body ) return
    const style = getComputedStyle( body )
    const height = body.offsetHeight + parseFloat( style.marginTop ) + parseFloat( style.marginBottom )
    this.element.style.height = `${Math.ceil( height )}px`
  }

  // Saved content's MathLive markup is incomplete: TinyMCE drops empty
  // elements when serializing, including MathLive's empty `ML__pstrut`
  // spacers, which misplaces superscripts, fractions, etc. The editor gets
  // away with this because it redraws every atom on load, so do the same
  // here, with the vendor's own atom classes (which work on plain DOM
  // elements; they only need a TinyMCE editor for editing, not update()).
  async renderMath( doc ) {
    const elements = Array.from( doc.querySelectorAll( ".lurch-atom[data-metadata_type]" ) )
      .filter( element => MATH_ATOM_TYPES.includes( JSON.parse( element.dataset.metadata_type ) ) )
    if ( elements.length == 0 ) return

    const [ { Atom }, expressions, , { represent } ] = await Promise.all( [
      import( "/lurchmath/atoms.js" ),
      import( "/lurchmath/expressions.js" ),
      import( "/lurchmath/expository-math.js" ), // registers the expositorymath Atom subclass
      import( "/lurchmath/notation.js" )
    ] )
    // Expression atoms in beginner mode convert via a module-level converter
    // that only expressions.install() sets up; it otherwise just adds a menu
    // item, hence the stub editor.
    expressions.install( { ui: { registry: { addMenuItem() {} } } } )
    // Each vendor module loads its MathLive converter separately, each via its
    // own getConverter() call that polls every 100ms for MathLive to finish
    // loading, and until then renders math as "undefined". So wait until
    // notation.js's converter (which update() renders with) works, then one
    // more polling interval for expressions.js's (beginner mode only).
    const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) )
    while ( represent( "x", "lurchNotation" ) === undefined ) await sleep( 50 )
    await sleep( 100 )

    elements.forEach( element => {
      try {
        Atom.from( element ).update()
      } catch ( error ) {
        // Leave the saved markup in place; it's close, just misaligned.
        console.error( error )
      }
    } )
  }
}
