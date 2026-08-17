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
end
