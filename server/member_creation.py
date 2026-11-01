"""Durable row identities shared by single and bulk member creation."""

import json
from uuid import NAMESPACE_URL, uuid5

CREATION_CONFLICT = (
    "This creation request was already used for a different or removed member."
)


def member_creation_id(organization_id, creation_id):
    if not creation_id:
        return None
    return uuid5(
        NAMESPACE_URL,
        "facenox:member-create:" + json.dumps([organization_id, creation_id]),
    ).hex


def matches_member_creation(member, data):
    return (
        not member.is_deleted
        and member.is_active
        and member.group_id == data["group_id"]
        and member.name == data["name"]
        and (member.role or None) == (data.get("role") or None)
        and (member.email or None) == (data.get("email") or None)
        and (data.get("person_id") is None or member.person_id == data["person_id"])
    )
