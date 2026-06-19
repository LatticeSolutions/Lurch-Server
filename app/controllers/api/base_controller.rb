module Api
  class BaseController < ActionController::Base
    skip_forgery_protection

    before_action :authenticate_user!

    rescue_from CanCan::AccessDenied do |exception|
      render json: { error: exception.message }, status: :forbidden
    end

    rescue_from ActiveRecord::RecordNotFound do
      render json: { error: "Not found" }, status: :not_found
    end
  end
end
