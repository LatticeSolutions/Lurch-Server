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

  test "index lists only the signed-in user's own documents" do
    others_published = Document.create!(title: "Others", content: "x", user: users(:other), visibility: :published)
    get documents_url, as: :json
    ids = response.parsed_body.map { |d| d["id"] }
    assert_includes ids, @document.id
    assert_not_includes ids, others_published.id
  end

  test "all_documents lists own and published documents, but not others' restricted ones" do
    others_published = Document.create!(title: "Others", content: "x", user: users(:other), visibility: :published)
    others_restricted = Document.create!(title: "Secret", content: "x", user: users(:other))
    get all_documents_url, as: :json
    assert_response :success
    ids = response.parsed_body.map { |d| d["id"] }
    assert_includes ids, @document.id
    assert_includes ids, others_published.id
    assert_not_includes ids, others_restricted.id
  end

  test "an admin's index lists only their own documents, but all_documents lists everything" do
    sign_in users(:admin)
    get documents_url, as: :json
    assert_not_includes response.parsed_body.map { |d| d["id"] }, @document.id
    get all_documents_url, as: :json
    assert_includes response.parsed_body.map { |d| d["id"] }, @document.id
  end

  test "should get all_documents" do
    get all_documents_url
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
    assert_redirected_to edit_document_url(Document.last)
  end

  test "should show document" do
    get document_url(@document)
    assert_response :success
  end

  test "show renders the sanitized document body in a sandboxed iframe, not the editor" do
    @document.update!(content: <<~HTML)
      <div id="metadata" style="display: none;"><div data-key="header">SECRET-METADATA</div></div>
      <div id="document"><p class="lurch-atom" data-metadata_type="x">Hello body</p><script>alert(1)</script></div>
    HTML

    get document_url(@document)
    assert_response :success
    assert_select "[data-controller=document-editor]", count: 0
    assert_select "[data-controller=document-view] iframe[sandbox][data-document-view-target=frame]" do |(iframe)|
      srcdoc = iframe["srcdoc"]
      assert_includes srcdoc, %(<p class="lurch-atom" data-metadata_type="x">Hello body</p>)
      assert_not_includes srcdoc, "SECRET-METADATA"
      assert_not_includes srcdoc, "<script"
      assert_not_includes iframe["sandbox"], "allow-scripts"
    end
  end

  test "show keeps MathLive's positioning styles but drops unsafe ones" do
    @document.update!(content: <<~HTML)
      <div id="document"><span style="top: -3.41em; position: relative">x</span><span style="background: url(javascript:alert(1)); left: expression(alert(1))">y</span></div>
    HTML

    get document_url(@document)
    assert_select "iframe[srcdoc]" do |(iframe)|
      srcdoc = iframe["srcdoc"]
      assert_includes srcdoc, %(<span style="top: -3.41em; position: relative;">x</span>)
      assert_includes srcdoc, "<span>y</span>"
    end
  end

  test "show renders the document's own body, not a context document's embedded in its header" do
    @document.update!(content: <<~HTML)
      <div id="metadata" style="display: none;"><div data-category="main" data-key="header" data-value-type="html"><div class="lurch-atom" data-metadata_type="&quot;dependency&quot;"><div data-key="content"><div id="metadata"></div><div id="document"><p>CONTEXT-BODY</p></div></div></div></div></div>
      <div id="document"><div id="context" class="lurch-atom"><p>PANEL</p></div><p>OWN-BODY</p></div>
    HTML

    get document_url(@document)
    assert_select "iframe[srcdoc]" do |(iframe)|
      srcdoc = iframe["srcdoc"]
      assert_includes srcdoc, "OWN-BODY"
      assert_not_includes srcdoc, "CONTEXT-BODY"
      assert_not_includes srcdoc, "PANEL"
    end
  end

  test "show links to the document's context documents" do
    context_doc = documents(:published_one)
    @document.update!(context_document_ids: [ context_doc.id ])

    get document_url(@document)
    assert_select "a[href=?]", document_path(context_doc), text: context_doc.title
  end

  test "show passes the context tree and metadata to the view's validation" do
    context_doc = documents(:published_one)
    @document.update!(context_document_ids: [ context_doc.id ], content: <<~HTML)
      <div id="metadata" style="display: none;"><div data-category="settings" data-key="notation">"lurch"</div></div>
      <div id="document"><p>Body</p></div>
    HTML

    get document_url(@document)
    assert_select "div[data-controller=document-view]" do |(view)|
      context = JSON.parse(view["data-document-view-context-value"])
      assert_equal [ context_doc.title ], context.map { |doc| doc["title"] }
      assert_includes view["data-document-view-metadata-value"], %(data-key="notation")
      assert_not_includes view["data-document-view-metadata-value"], "Body"
    end
  end

  test "show renders a hidden checkmark by the title, for the view's validation to reveal" do
    get document_url(@document)
    assert_select "[data-controller=document-view] h1 [data-document-view-target=checkmark][hidden]", text: "✓"
  end

  test "should get edit" do
    get edit_document_url(@document)
    assert_response :success
  end

  test "a non-owner cannot get edit" do
    sign_in users(:other)
    get edit_document_url(@document)
    assert_redirected_to root_url
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
    get all_documents_url
    assert_redirected_to new_user_session_url
  end

  test "an anonymous user can view a published document, without edit or duplicate links" do
    sign_out users(:regular)
    get document_url(documents(:published_one))
    assert_response :success
    assert_select "a", text: "Edit", count: 0
    assert_select "button", text: "Duplicate", count: 0
  end

  test "an anonymous user can fetch a published document as JSON" do
    sign_out users(:regular)
    get document_url(documents(:published_one), format: :json)
    assert_response :success
    assert_equal "PublicDoc", response.parsed_body["title"]
  end

  test "an anonymous user is sent to sign in for a private document, then returned to it" do
    sign_out users(:regular)
    get document_url(@document)
    assert_redirected_to new_user_session_url

    post user_session_url, params: { user: { email: "user@example.com", password: "password123" } }
    assert_redirected_to document_url(@document)
  end

  test "an anonymous user cannot edit, create or duplicate documents" do
    sign_out users(:regular)
    published = documents(:published_one)
    get edit_document_url(published)
    assert_redirected_to new_user_session_url
    get new_document_url
    assert_redirected_to new_user_session_url
    assert_no_difference("Document.count") do
      post duplicate_document_url(published)
    end
    assert_redirected_to new_user_session_url
  end

  test "an anonymous user can explore a published document, with a not-saved banner" do
    sign_out users(:regular)
    get explore_document_url(documents(:published_one))
    assert_response :success
    assert_select "[data-controller=document-editor][data-document-editor-explore-value=true]"
    assert_select "[role=alert]", text: /will not be saved/ do
      assert_select "a[href=?]", new_user_session_path
    end
  end

  test "an anonymous user is sent to sign in to explore a private document" do
    sign_out users(:regular)
    get explore_document_url(@document)
    assert_redirected_to new_user_session_url
  end

  test "a non-owner can explore a published document, but not a private one" do
    sign_in users(:other)
    get explore_document_url(documents(:published_one))
    assert_response :success
    assert_select "[role=alert] button", text: "Duplicate"

    get explore_document_url(@document)
    assert_redirected_to root_url
  end

  test "edit is not in explore mode and has no not-saved banner" do
    get edit_document_url(@document)
    assert_select "[data-controller=document-editor][data-document-editor-explore-value=false]"
    assert_select "[role=alert]", count: 0
  end

  test "show links to explore only for users who cannot edit" do
    published = documents(:published_one)
    get document_url(published)
    assert_select "a", text: "Explore", count: 0

    sign_out users(:regular)
    get document_url(published)
    assert_select "a[href=?]", explore_document_path(published), text: "Explore"
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
    expected = [ documents(:published_one), documents(:published_two), documents(:published_three) ].map(&:id)
    assert_equal expected.sort, ids.sort
  end

  test "public_documents excludes candidates that would close a cycle" do
    a = documents(:published_one)
    b = documents(:published_two)
    a.update!(context_document_ids: [ b.id ])

    sign_in users(:other)
    get public_documents_url(excluding: b.id), as: :json
    assert_response :success
    ids = JSON.parse(response.body).map { |doc| doc["id"] }

    assert_not_includes ids, a.id
    assert_not_includes ids, b.id
    assert_includes ids, documents(:published_three).id
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

  test "owner can duplicate their own document" do
    assert_difference("Document.count", 1) do
      post duplicate_document_url(@document)
    end

    new_document = Document.last
    assert_equal users(:regular), new_document.user
    assert new_document.restricted?
    assert_equal "#{@document.title} (Copy)", new_document.title
    assert_equal @document.content, new_document.content
    assert_redirected_to edit_document_url(new_document)
  end

  test "duplicating a document carries over its context documents" do
    target = documents(:published_one)
    @document.update!(context_document_ids: [ target.id ])

    post duplicate_document_url(@document)

    new_document = Document.last
    assert_equal [ target.id ], new_document.context_document_ids
  end

  test "a non-owner can duplicate a published document" do
    published = documents(:published_one)
    sign_in users(:other)

    assert_difference("Document.count", 1) do
      post duplicate_document_url(published)
    end

    new_document = Document.last
    assert_equal users(:other), new_document.user
    assert new_document.restricted?
  end

  test "a non-owner cannot duplicate a non-published document" do
    sign_in users(:other)

    assert_no_difference("Document.count") do
      post duplicate_document_url(@document)
    end
    assert_redirected_to root_url
  end

  test "an admin can duplicate another user's document" do
    sign_in users(:admin)

    assert_difference("Document.count", 1) do
      post duplicate_document_url(@document)
    end

    new_document = Document.last
    assert_equal users(:admin), new_document.user
  end
end
