Rails.application.routes.draw do
  devise_for :users

  # Vendored public/lurchmath/math-live.js resolves the MathLive stylesheet URL
  # as a bare relative path ('../lde/dependencies/mathlive/mathlive-static.css'),
  # which the browser resolves against the *page* URL rather than the script's
  # own URL. On /documents/:id/edit this resolves to
  # /documents/lde/dependencies/mathlive/mathlive-static.css instead of
  # /lde/dependencies/mathlive/mathlive-static.css, 404ing (it works fine on
  # /documents/:id, the read-only view, where the math happens to resolve
  # correctly). Redirect the broken path to where the file actually lives.
  # TODO: remove once fixed upstream in kenmonks/lurch.
  get "documents/lde/*path", to: redirect { |params, _req| "/lde/#{params[:path]}" }, format: false

  resources :documents do
    member do
      patch :publish
      patch :unpublish
      patch :context
      post :duplicate
    end
    get "public", on: :collection, action: :public_documents
  end
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
  root "pages#home"
end
