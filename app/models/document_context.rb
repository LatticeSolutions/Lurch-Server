class DocumentContext < ApplicationRecord
  belongs_to :document
  belongs_to :context_document, class_name: "Document"
end
