class Ability
  include CanCan::Ability

  def initialize(user)
    user ||= User.new

    if user.admin?
      can :manage, :all
    else
      can :manage, Document, user_id: user.id
      cannot [ :publish, :unpublish ], Document
      can [ :read, :duplicate ], Document, visibility: "published"
    end
  end
end
