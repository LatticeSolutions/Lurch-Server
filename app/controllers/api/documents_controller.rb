module Api
  class DocumentsController < Api::BaseController
    before_action :set_document, only: %i[show update destroy]

    def index
      @documents = Document.accessible_by(current_ability)
      render json: @documents
    end

    def show
      authorize! :read, @document
      render json: @document
    end

    def create
      @document = current_user.documents.build(document_params)
      authorize! :create, @document

      if @document.save
        render json: @document, status: :created
      else
        render json: @document.errors, status: :unprocessable_entity
      end
    end

    def update
      authorize! :update, @document

      if @document.update(document_params)
        render json: @document
      else
        render json: @document.errors, status: :unprocessable_entity
      end
    end

    def destroy
      authorize! :destroy, @document
      @document.destroy
      head :no_content
    end

    private

    def set_document
      @document = Document.find(params[:id])
    end

    def document_params
      params.require(:document).permit(:source)
    end
  end
end
