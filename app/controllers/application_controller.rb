class ApplicationController < ActionController::Base
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  rescue_from CanCan::AccessDenied do |exception|
    if user_signed_in?
      redirect_to root_path, alert: exception.message
    else
      # A guest following a link to something they can't see (e.g. a private
      # document): ask them to sign in, then return them here.
      store_location_for(:user, request.fullpath) if request.get?
      redirect_to new_user_session_path, alert: exception.message
    end
  end

  protected

  def after_sign_in_path_for(resource)
    stored_location_for(resource) || documents_path
  end
end
