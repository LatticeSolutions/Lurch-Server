module DocumentsHelper
  # Loofah's :prune scrubber, except for inline styles: Loofah's CSS
  # safelist drops properties such as `top` and `position`, which MathLive's
  # static markup uses to place superscripts, fractions, etc. So each style
  # is filtered here instead, allowing Loofah's properties plus those, with
  # values limited to plain lengths/keywords/colors (no url() or other
  # functions that could load anything).
  class ContentScrubber < Loofah::Scrubber
    EXTRA_CSS_PROPERTIES = %w[ position top right bottom left opacity box-sizing ].freeze
    ALLOWED_CSS_FUNCTIONS = %w[ rgb rgba hsl hsla calc ].freeze
    CSS_VALUE = %r{\A[#\w\s.,%()+\-*/]*\z}

    def initialize
      @direction = :top_down
      @prune = Loofah::Scrubbers::Prune.new
    end

    def scrub(node)
      style = node["style"] if node.element?
      result = @prune.scrub(node)
      if style && node.parent
        safe = safe_style(style)
        safe.empty? ? node.remove_attribute("style") : node["style"] = safe
      end
      result
    end

    private

      def safe_style(style)
        style.split(";").filter_map do |declaration|
          property, value = declaration.split(":", 2).map { |part| part.to_s.strip }
          property = property.downcase
          next unless allowed_property?(property) && safe_value?(value)
          "#{property}: #{value};"
        end.join(" ")
      end

      def allowed_property?(property)
        Loofah::HTML5::SafeList::ALLOWED_CSS_PROPERTIES.include?(property) ||
          EXTRA_CSS_PROPERTIES.include?(property) ||
          Loofah::HTML5::SafeList::SHORTHAND_CSS_PROPERTIES.include?(property.split("-").first)
      end

      def safe_value?(value)
        value.present? && value.match?(CSS_VALUE) &&
          value.scan(/([\w-]*)\s*\(/).flatten.all? { |fn| ALLOWED_CSS_FUNCTIONS.include?(fn.downcase) }
      end
  end

  # A standalone HTML page showing `document`'s rendered body, for the
  # read-only view's sandboxed <iframe srcdoc>. Saved content is already
  # rendered HTML (atoms, MathLive's static markup, feedback markers), so it
  # only needs the same content stylesheets the editor loads into its own
  # iframe (see content_css in public/lurchmath/editor.js). Those style bare
  # `body`, `p`, `div`, etc., hence the iframe rather than inlining it here.
  def document_view_srcdoc(document)
    <<~HTML
      <!DOCTYPE html>
      <html>
        <head>
          <base target="_blank">
          <link rel="stylesheet" href="/lurchmath/syntax-theme.css">
          <link rel="stylesheet" href="/lde/dependencies/mathlive/mathlive-static.css">
        </head>
        <body class="shell-style-boxed">#{document_body_html(document)}</body>
      </html>
    HTML
  end

  # The raw #metadata part of the content (document settings and header), or
  # "" if there is none, for the read-only view's validation. It's parsed
  # inertly client-side and never rendered; see document_view_controller.js.
  def document_metadata_html(document)
    document_part(Nokogiri::HTML5.fragment(document.content.to_s), "metadata")&.to_html.to_s
  end

  # The sanitized inner HTML of the content's #document part (falling back to
  # the whole content if there is none, like LurchDocument.documentParts).
  # Any saved #context panel (the vendor's "Mathematical Context" viewer,
  # which previews context documents) is dropped, as the editor does on load.
  # Rails' `sanitize` would strip the data-* attributes, inline styles and
  # tables that the Lurch stylesheets rely on; see ContentScrubber.
  def document_body_html(document)
    fragment = Nokogiri::HTML5.fragment(document.content.to_s)
    part = document_part(fragment, "document")
    (part || fragment).css("#context").each(&:remove)
    body = part ? part.inner_html : fragment.to_html
    Loofah.html5_fragment(body).scrub!(ContentScrubber.new).to_s
  end

  # The top-level child of `fragment` with the given id ("metadata" or
  # "document"), like LurchDocument.documentParts. It must be top-level: the
  # metadata's header holds context documents' dependency atoms, which embed
  # each context document's own #metadata and #document.
  def document_part(fragment, id)
    fragment.children.find { |node| node.element? && node["id"] == id }
  end
end
