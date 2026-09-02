json.array! @documents do |document|
  json.id document.id
  json.title document.title
  json.owner document.user.email
end
