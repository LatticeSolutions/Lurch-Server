class CreateDocuments < ActiveRecord::Migration[8.1]
  def change
    create_table :documents do |t|
      t.text :source
      t.references :user, null: false, foreign_key: true

      t.timestamps
    end
  end
end
