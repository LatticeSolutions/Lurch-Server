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
  validate :context_document_ids_cannot_contain_a_cycle

  after_update :remove_as_context_when_restricted

  # Whether this document transitively depends on `other`, following the
  # context_documents graph. Used both by the cycle validation below and by
  # the public_documents picker (to exclude candidates that would close a
  # cycle). Public so other Document instances can call it on each other.
  def transitively_depends_on?(other, visited = Set.new)
    return false if visited.include?(id)
    visited << id
    context_documents.any? { |d| d.id == other.id || d.transitively_depends_on?(other, visited) }
  end

  # A recursive tree of this document's context documents, each carrying its
  # own nested context_documents, for concatenating nested context in the
  # editor the same way the vendor's own dependency mechanism does.
  def context_documents_tree(visited = Set.new)
    return [] if visited.include?(id)
    visited = visited + [ id ]
    context_documents.map do |doc|
      {
        id: doc.id, title: doc.title, owner: doc.user.email, content: doc.content,
        context_documents: doc.context_documents_tree(visited)
      }
    end
  end

  private

    def context_documents_must_be_published
      return if context_document_ids.empty?
      unless Document.published.where(id: context_document_ids).count == context_document_ids.uniq.count
        errors.add(:context_document_ids, "must reference only published documents")
      end
    end

    def context_document_ids_cannot_contain_a_cycle
      context_documents.each do |target|
        next unless target.transitively_depends_on?(self)
        errors.add(:context_document_ids, "would create a circular reference (via \"#{target.title}\")")
        break
      end
    end

    def remove_as_context_when_restricted
      context_references.destroy_all if saved_change_to_visibility? && restricted?
    end
end
