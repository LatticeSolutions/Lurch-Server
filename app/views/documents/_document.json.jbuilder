json.extract! document, :id, :title, :content, :created_at
# Full (microsecond) precision, so the editor can send it back verbatim as an
# auto-save's expected_updated_at (the default JSON encoding keeps only ms).
json.updated_at document.updated_at.iso8601(6)
json.url document_url(document, format: :json)
