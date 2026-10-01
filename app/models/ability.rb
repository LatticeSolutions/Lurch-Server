class Ability
  include CanCan::Ability

  def initialize(user)
    # Guests may only view published documents (e.g. via a share link).
    return can(:read, Document, visibility: "published") if user.nil?

    if user.admin?
      can :manage, :all
    else
      can :manage, Document, user_id: user.id
      cannot [ :publish, :unpublish ], Document
      can [ :read, :duplicate ], Document, visibility: "published"
    end
  end
end
