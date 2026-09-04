require "test_helper"

class DocumentTest < ActiveSupport::TestCase
  test "can set a published document as context and it persists" do
    doc = documents(:one)
    target = documents(:published_one)
    doc.context_document_ids = [ target.id ]
    assert doc.save
    assert_equal [ target.id ], doc.reload.context_document_ids
  end

  test "cannot set a non-published document as context" do
    doc = documents(:one)
    doc.context_document_ids = [ documents(:two).id ]
    assert_not doc.save
    assert doc.errors[:context_document_ids].any?
  end

  test "cannot depend on itself" do
    doc = documents(:published_one)
    doc.context_document_ids = [ doc.id ]
    assert_not doc.save
    assert doc.errors[:context_document_ids].any?
  end

  test "unpublishing a document removes it from others' context" do
    doc = documents(:one)
    target = documents(:published_one)
    doc.update!(context_document_ids: [ target.id ])

    target.restricted!

    assert_equal [], doc.reload.context_document_ids
  end

  test "transitively_depends_on? is true across a chain and false for unrelated documents" do
    a = documents(:published_one)
    b = documents(:published_two)
    c = documents(:published_three)
    a.update!(context_document_ids: [ b.id ])
    b.update!(context_document_ids: [ c.id ])

    assert a.reload.transitively_depends_on?(b)
    assert a.reload.transitively_depends_on?(c)
    assert b.reload.transitively_depends_on?(c)
    assert_not c.reload.transitively_depends_on?(a)
    assert_not documents(:one).transitively_depends_on?(a)
  end

  test "closing a cycle through a chain is rejected" do
    a = documents(:published_one)
    b = documents(:published_two)
    c = documents(:published_three)
    a.update!(context_document_ids: [ b.id ])
    b.update!(context_document_ids: [ c.id ])

    c.context_document_ids = [ a.id ]
    assert_not c.save
    assert c.errors[:context_document_ids].any?
  end

  test "context_documents_tree nests a chain recursively" do
    a = documents(:published_one)
    b = documents(:published_two)
    c = documents(:published_three)
    a.update!(context_document_ids: [ b.id ])
    b.update!(context_document_ids: [ c.id ])

    tree = a.reload.context_documents_tree
    assert_equal 1, tree.length
    assert_equal b.id, tree.first[:id]
    assert_equal b.content, tree.first[:content]
    nested = tree.first[:context_documents]
    assert_equal 1, nested.length
    assert_equal c.id, nested.first[:id]
    assert_equal [], nested.first[:context_documents]
  end
end
