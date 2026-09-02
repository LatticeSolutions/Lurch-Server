require "test_helper"

class DocumentsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @document = documents(:one)
    sign_in users(:regular)
  end

  test "should get index" do
    get documents_url
    assert_response :success
  end

  test "should get new" do
    get new_document_url
    assert_response :success
  end

  test "should create document" do
    assert_difference("Document.count") do
      post documents_url, params: { document: { content: @document.content, title: @document.title } }
    end

    assert_equal users(:regular), Document.last.user
    assert_redirected_to document_url(Document.last)
  end

  test "should show document" do
    get document_url(@document)
    assert_response :success
  end

  test "should update document" do
    patch document_url(@document), params: { document: { content: @document.content, title: @document.title } }
    assert_redirected_to document_url(@document)
  end

  test "should destroy document" do
    assert_difference("Document.count", -1) do
      delete document_url(@document)
    end

    assert_redirected_to documents_url
  end

  test "cannot update another user's document" do
    sign_in users(:other)
    patch document_url(@document), params: { document: { title: "hijacked" } }
    assert_redirected_to root_url
    assert_not_equal "hijacked", @document.reload.title
  end

  test "admin can manage another user's document" do
    sign_in users(:admin)
    patch document_url(@document), params: { document: { title: "edited by admin" } }
    assert_redirected_to document_url(@document)
  end

  test "redirects unauthenticated requests to sign in" do
    sign_out users(:regular)
    get documents_url
    assert_redirected_to new_user_session_url
  end

  test "a non-owner can view a published document" do
    published = documents(:published_one)
    sign_in users(:other)
    get document_url(published)
    assert_response :success
  end

  test "a non-owner cannot update a published document" do
    published = documents(:published_one)
    sign_in users(:other)
    patch document_url(published), params: { document: { title: "hijacked" } }
    assert_redirected_to root_url
    assert_not_equal "hijacked", published.reload.title
  end

  test "a non-owner cannot destroy a published document" do
    published = documents(:published_one)
    sign_in users(:other)
    assert_no_difference("Document.count") do
      delete document_url(published)
    end
    assert_redirected_to root_url
  end

  test "a non-admin owner cannot publish or unpublish their own document" do
    patch publish_document_url(@document)
    assert_redirected_to root_url
    assert @document.reload.restricted?

    published = documents(:published_one)
    patch unpublish_document_url(published)
    assert_redirected_to root_url
    assert published.reload.published?
  end

  test "an admin can publish and unpublish another user's document" do
    sign_in users(:admin)

    patch publish_document_url(@document)
    assert_redirected_to documents_url
    assert @document.reload.published?

    patch unpublish_document_url(@document)
    assert_redirected_to documents_url
    assert @document.reload.restricted?
  end

  test "public_documents lists only published documents, regardless of owner" do
    sign_in users(:other)
    get public_documents_url, as: :json
    assert_response :success
    ids = JSON.parse(response.body).map { |doc| doc["id"] }
    assert_equal [ documents(:published_one).id ], ids
  end

  test "owner can set context on their own document" do
    target = documents(:published_one)
    patch context_document_url(@document), params: { document: { context_document_ids: [ target.id ] } }, as: :json
    assert_response :success
    assert_equal [ target.id ], @document.reload.context_document_ids
  end

  test "a non-owner cannot set context on someone else's document" do
    target = documents(:published_one)
    sign_in users(:other)
    patch context_document_url(@document), params: { document: { context_document_ids: [ target.id ] } }
    assert_redirected_to root_url
    assert_equal [], @document.reload.context_document_ids
  end

  test "an admin can set context on someone else's document" do
    target = documents(:published_one)
    sign_in users(:admin)
    patch context_document_url(@document), params: { document: { context_document_ids: [ target.id ] } }, as: :json
    assert_response :success
    assert_equal [ target.id ], @document.reload.context_document_ids
  end
end
