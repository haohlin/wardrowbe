import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.user_service import UserService


@pytest.mark.asyncio
async def test_get_by_id_eager_loads_preferences(
    db_session: AsyncSession, test_user_with_preferences
):
    user_id = test_user_with_preferences.id
    db_session.expunge_all()

    user = await UserService(db_session).get_by_id(user_id)

    assert user is not None
    assert user.preferences is not None
    assert user.preferences.color_favorites == ["black", "navy", "white"]
