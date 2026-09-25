# Serves the third-party `lde`/`lurchmath` tree fetched into
# vendor/lurch/<commit> by bin/vendor-lurch.mjs (see that file and
# package.json's "lurchSource" field) at a URL that has the same commit
# baked into it, e.g. /lurch/<commit>/lurchmath/editor.js.
#
# Baking the commit into the URL (rather than serving at a fixed path like
# the old /lurchmath) is what makes it safe to cache these files for a full
# year: bumping "lurchSource".commit changes the URL too, so there's no
# stale-cache window to worry about after a deploy that bumps it.
lurch_source = JSON.parse(Rails.root.join("package.json").read)["lurchSource"]
Rails.application.config.x.lurch_vendor_root = "/lurch/#{lurch_source["commit"]}"

# Files actually live at vendor/lurch/<commit>/{lde,lurchmath}/... and are
# served at /lurch/<commit>/{lde,lurchmath}/... -- Rack::Static (like
# Rack::Files underneath it) resolves a request by appending its full
# PATH_INFO to :root, so :root here is "vendor" (the parent of "lurch"), not
# "vendor/lurch/<commit>" itself.
Rails.application.config.middleware.insert_before 0, Rack::Static,
  urls: [ Rails.application.config.x.lurch_vendor_root ],
  root: Rails.root.join("vendor"),
  header_rules: [ [ :all, { "Cache-Control" => "public, max-age=#{1.year.to_i}, immutable" } ] ]
