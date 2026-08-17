class DocumentsController < ApplicationController
  before_action :authenticate_user!

  load_resource
  before_action :assign_current_user, only: %i[ new create ]
  authorize_resource

  # GET /documents or /documents.json
  def index
  end

  # GET /documents/1 or /documents/1.json
  def show
  end

  # GET /documents/new
  def new
  end

  # POST /documents or /documents.json
  def create
    respond_to do |format|
      if @document.save
        format.html { redirect_to @document, notice: "Document was successfully created." }
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
end
