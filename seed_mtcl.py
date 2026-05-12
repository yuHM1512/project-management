#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import io
import re
import sys
from pathlib import Path

import pandas as pd

from database import SessionLocal, init_db
from models import Mtcl


if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def normalize_units(raw_value) -> list[str]:
    if raw_value is None or (isinstance(raw_value, float) and pd.isna(raw_value)):
        return []

    units = []
    for part in str(raw_value).replace(";", ",").split(","):
        unit_name = part.strip()
        if unit_name and unit_name not in units:
            units.append(unit_name)
    return units


def clean_mtcl_text(raw_value) -> str:
    if raw_value is None or (isinstance(raw_value, float) and pd.isna(raw_value)):
        return ""
    text = re.sub(r"\s*\[[^\]]+\]", "", str(raw_value))
    return re.sub(r"\s+", " ", text).strip()


def seed_mtcl():
    init_db()
    excel_file = Path("mtcl_parse.xlsx")
    if not excel_file.exists():
        print(f"[ERROR] File không tồn tại: {excel_file}")
        sys.exit(1)

    df = pd.read_excel(excel_file)
    db = SessionLocal()

    try:
        db.query(Mtcl).delete()

        created = 0
        for _, row in df.iterrows():
            objective_group = clean_mtcl_text(row.iloc[0])
            description = clean_mtcl_text(row.iloc[2])
            units = [clean_mtcl_text(unit) for unit in normalize_units(row.iloc[1]) if clean_mtcl_text(unit)]

            if not objective_group or not description:
                continue

            db.add(Mtcl(
                objective_group=objective_group,
                units=units,
                description=description,
            ))
            created += 1

        db.commit()
        print(f"[SUCCESS] Đã seed {created} mục tiêu MTCL.")
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Seed MTCL thất bại: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_mtcl()
