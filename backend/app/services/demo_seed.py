"""Curated demo skills for mock mode.

The live demo store is seeded separately in DynamoDB. Mock mode is what most
people can run without AWS credentials, so it ships the same three journeys:
an event bag, a tea ritual, and a desk reset.

This is demo *content*, clearly labeled as mock mode, never fake logs or fake
success. Both the HTTP API and the MCP server run this seed in their own
process, so `/alexa` works offline and shows real MCP calls against real
(persisted-for-the-process) records.
"""
from app.models.core import (
    Skill,
    SkillItem,
    SkillSource,
    SkillStep,
    SkillType,
)
from app.services.skill_store import SkillStore

TEACHER = "demo-teacher"
LEARNER = "demo-learner"


def _bag() -> Skill:
    return Skill(
        skill_id="demo-bag",
        owner_id=TEACHER,
        title="My Event Bag",
        type=SkillType.packing,
        source=SkillSource.voice,
        summary="Everything I need for a conference, taught once.",
        items=[
            SkillItem(name="Laptop"),
            SkillItem(name="Charger", aliases=["phone charger"]),
            SkillItem(name="Water bottle", aliases=["bottle"]),
            SkillItem(name="Notebook", aliases=["notepad"]),
            SkillItem(name="Pen"),
            SkillItem(name="Extra bag", aliases=["spare bag"]),
        ],
        steps=[
            SkillStep(order=0, instruction="Charge everything the night before."),
            SkillStep(order=1, instruction="Put the badge in the front pocket."),
        ],
    )


def _tea() -> Skill:
    return Skill(
        skill_id="demo-tea",
        owner_id=TEACHER,
        title="Make Tea (My Way)",
        type=SkillType.household_procedure,
        source=SkillSource.text,
        summary="The exact tea ritual I keep forgetting.",
        items=[
            SkillItem(name="Kettle"),
            SkillItem(name="Tea leaves", aliases=["leaves"]),
            SkillItem(name="Cup", aliases=["mug"]),
        ],
        steps=[
            SkillStep(order=0, instruction="Boil fresh water."),
            SkillStep(order=1, instruction="Warm the cup with a splash of hot water."),
            SkillStep(order=2, instruction="Add one spoon of leaves and steep for three minutes."),
        ],
    )


def _desk() -> Skill:
    return Skill(
        skill_id="demo-desk",
        owner_id=TEACHER,
        title="Clean My Desk",
        type=SkillType.checklist,
        source=SkillSource.voice,
        summary="Ten minutes, no distractions.",
        items=[
            SkillItem(name="Mugs"),
            SkillItem(name="Papers"),
            SkillItem(name="Cables"),
            SkillItem(name="Wipes"),
        ],
        steps=[
            SkillStep(order=0, instruction="Take every mug to the kitchen."),
            SkillStep(order=1, instruction="Sort papers into keep and recycle."),
            SkillStep(order=2, instruction="Coil the cables."),
            SkillStep(order=3, instruction="Wipe the surface."),
        ],
    )


def seed_demo_skills(store: SkillStore) -> None:
    """Idempotent: only seed when the demo teacher has no records yet."""
    if store.list_skills_for_reader(TEACHER):
        return
    for skill in (_bag(), _desk(), _tea()):
        store.create_skill(skill)
