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
end
