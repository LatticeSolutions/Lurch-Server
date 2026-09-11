class DocumentsController < ApplicationController
  before_action :authenticate_user!

  load_resource except: :public_documents
  before_action :assign_current_user, only: %i[ new create ]
  authorize_resource except: :public_documents

  # GET /documents or /documents.json
  def index
  end

  # GET /documents/1 or /documents/1.json
  def show
  end

  # GET /documents/1/edit
  def edit
  end

  # GET /documents/public or /documents/public.json
  def public_documents
    @documents = Document.published.order(:title)
    if (current = Document.find_by(id: params[:excluding]))
      @documents = @documents.reject { |d| d.id == current.id || d.transitively_depends_on?(current) }
    end
  end

  # PATCH /documents/1/publish
  def publish
    @document.published!
    redirect_to documents_path, notice: "Document published."
  end

  # PATCH /documents/1/unpublish
  def unpublish
    @document.restricted!
    redirect_to documents_path, notice: "Document made private."
  end

  # PATCH /documents/1/context
  def context
    if @document.update(context_params)
      render json: { context_document_ids: @document.context_document_ids,
                     context_documents: @document.context_documents_tree }
    else
      render json: @document.errors, status: :unprocessable_content
    end
  end

  # POST /documents/1/duplicate
  def duplicate
    @new_document = @document.dup
    @new_document.title = "#{@document.title} (Copy)"
    @new_document.user = current_user
    @new_document.visibility = :restricted
    @new_document.save!

    @document.document_contexts.each do |dc|
      @new_document.document_contexts.create!(context_document_id: dc.context_document_id)
    end

    redirect_to edit_document_path(@new_document), notice: "Document duplicated."
  end

  # GET /documents/new
  def new
  end

  # POST /documents or /documents.json
  def create
    respond_to do |format|
      if @document.save
        format.html { redirect_to edit_document_path(@document), notice: "Document was successfully created." }
        format.json { render :show, status: :created, location: @document }
      else
        format.html { render :new, status: :unprocessable_content }
        format.json { render json: @document.errors, status: :unprocessable_content }
      end
    end
  end

  # PATCH/PUT /documents/1 or /documents/1.json
  def update
    respond_to do |format|
      if @document.update(document_params)
        format.html { redirect_to @document, notice: "Document was successfully updated.", status: :see_other }
        format.json { render :show, status: :ok, location: @document }
      else
        format.html { render :edit, status: :unprocessable_content }
        format.json { render json: @document.errors, status: :unprocessable_content }
      end
    end
  end

  # DELETE /documents/1 or /documents/1.json
  def destroy
    @document.destroy!

    respond_to do |format|
      format.html { redirect_to documents_path, notice: "Document was successfully destroyed.", status: :see_other }
      format.json { head :no_content }
    end
  end

  private
    def assign_current_user
      @document.user = current_user
    end

    # Only allow a list of trusted parameters through. user_id is intentionally
    # excluded so ownership cannot be set/overridden via the form.
    def document_params
      params.expect(document: [ :title, :content ])
    end

    def context_params
      params.expect(document: [ context_document_ids: [] ])
    end
end
