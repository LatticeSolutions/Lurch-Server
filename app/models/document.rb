class Document < ApplicationRecord
  self.implicit_order_column = "created_at"

  belongs_to :user

  enum :visibility, { restricted: 0, published: 1 }
end
