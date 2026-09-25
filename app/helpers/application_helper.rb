module ApplicationHelper
  # URL prefix (with the vendored commit baked in) under which
  # vendor/lurch/<commit>/{lde,lurchmath} is served -- see
  # config/initializers/lurch_vendor.rb.
  def lurch_vendor_root
    Rails.application.config.x.lurch_vendor_root
  end
end
