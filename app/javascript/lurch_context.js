import { Atom } from "/lurchmath/atoms.js"

// HTML for a document header's Dependency atoms, built from a list of
// { id, title, owner, content, context_documents } context documents. Each
// entry's own context_documents is recursed into, so a nested chain (A
// depends on B, B depends on C) is concatenated the same way the vendor's own
// URL-based dependency mechanism concatenates nested external files: each
// dependency atom's "content" metadata holds the *entire* nested document
// (its own #metadata/header, with its own nested dependency atoms, plus its
// #document body) verbatim, all the way down.
//
// `editor` is a TinyMCE editor, or anything shaped enough like one for
// Atom.newBlock() (see document_view_controller.js). Context documents are
// other users' published content, so it's parsed with DOMParser, which is
// inert, rather than LurchDocument.documentParts(), which sets innerHTML on
// an element in the main page (where e.g. an <img onerror> would run).
export const contextHeaderHTML = ( editor, documents ) =>
  documents.map( doc => dependencyAtomHTML( editor, doc ) ).join( "" )

const dependencyAtomHTML = ( editor, doc ) => {
  const nestedHeaderHTML = contextHeaderHTML( editor, doc.context_documents || [] )
  const body = doc.content
    // Top-level #document only, like LurchDocument.documentParts(): the
    // content's own header embeds its context documents' #document parts.
    ? ( Array.from( new DOMParser().parseFromString( doc.content, "text/html" ).body.children )
        .find( element => element.id === "document" )?.innerHTML ?? doc.content )
    : ""
  const nestedDocumentHTML =
    `<div id="metadata" style="display: none;">`
    + `<div data-category="main" data-key="header" data-value-type="html">${nestedHeaderHTML}</div>`
    + `</div><div id="document">${body}</div>`
  const dependency = Atom.newBlock( editor, "", {
    type: "dependency",
    description: "none",
    filename: doc.title,
    source: "Public Documents",
    autoRefresh: false
  } )
  dependency.setHTMLMetadata( "content", nestedDocumentHTML )
  dependency.update()
  return dependency.element.outerHTML
}
