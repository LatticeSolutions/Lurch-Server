class Document < ApplicationRecord
  self.implicit_order_column = "created_at"

  belongs_to :user
  has_many :document_contexts, dependent: :destroy
  has_many :context_documents, through: :document_contexts
  # The reverse direction: rows where THIS document is used as someone else's context.
  has_many :context_references, class_name: "DocumentContext",
    foreign_key: :context_document_id, dependent: :destroy

  enum :visibility, { restricted: 0, published: 1 }

  validate :context_documents_must_be_published
  validate :cannot_depend_on_self

  after_update :remove_as_context_when_restricted

  private

    def context_documents_must_be_published
      return if context_document_ids.empty?
      unless Document.published.where(id: context_document_ids).count == context_document_ids.uniq.count
        errors.add(:context_document_ids, "must reference only published documents")
      end
    end

    def cannot_depend_on_self
      errors.add(:context_document_ids, "cannot include the document itself") if context_document_ids.include?(id)
    end

    def remove_as_context_when_restricted
      context_references.destroy_all if saved_change_to_visibility? && restricted?
    end
end
