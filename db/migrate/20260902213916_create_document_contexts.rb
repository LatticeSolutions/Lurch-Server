class CreateDocumentContexts < ActiveRecord::Migration[8.1]
  def change
    create_table :document_contexts, id: :uuid do |t|
      t.references :document, null: false, foreign_key: true, type: :uuid
      t.references :context_document, null: false, foreign_key: { to_table: :documents }, type: :uuid
      t.timestamps
    end
    add_index :document_contexts, [ :document_id, :context_document_id ], unique: true,
      name: "index_document_contexts_on_document_and_context"
  end
end
