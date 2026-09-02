class AddVisibilityToDocuments < ActiveRecord::Migration[8.1]
  def change
    add_column :documents, :visibility, :integer, default: 0, null: false
    add_index :documents, :visibility
  end
end
