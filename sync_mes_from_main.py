import argparse
import os
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from database import Base
from models import MESKPI, MESMapNode, MESModuleDetail


load_dotenv()


SOURCE_DEFAULT = "postgresql://postgres:m29%40ksnb@172.16.0.27:5432/project_management"


KPI_TITLE_TRANSLATIONS = {
    1: "Reduce Paper-Based Tasks",
    2: "Increase Sewing Line Productivity",
    3: "Reduce Repeat Defects",
    4: "Accelerate Data Processing",
    5: "Improve Payroll Accuracy",
    6: "Ensure End-to-End Traceability",
}


MAP_NODE_TRANSLATIONS = {
    1: {
        "title": "Raw Material Warehouse",
        "description": "Digitize the full lifecycle of raw and auxiliary materials.",
    },
    2: {
        "title": "Finished Goods Warehouse",
        "description": "Control outgoing quality and provide full transparency across the PO -> Pallet -> Buyer chain.",
    },
    3: {
        "title": "GTD Module",
        "description": "Control Decathlon GTD delivery standards with a conveyor system integrated with AI cameras.",
    },
    4: {
        "title": "Cutting Room Digitization",
        "description": "Control material loss and provide transparent data from marker to semi-finished goods.",
    },
    5: {
        "title": "Sewing Line Productivity",
        "description": "Visualize the production line in real time, integrated with IoT and Andon.",
    },
    6: {
        "title": "Accessories Warehouse",
        "description": "Extend the control loop to accessories issued to the line and complete the MES ecosystem.",
    },
}


MODULE_DETAIL_TRANSLATIONS = {
    1: {
        "title": "🏗️ System & Engine Setup",
        "description": "Build a sustainable framework architecture, design high-performance database models, and develop a synchronized engine that fully connects the Hachiba APP ecosystem.",
    },
    2: {
        "title": "🔄 Inbound/Outbound Management & QR Hub",
        "description": "Digitize inbound and outbound processes from Bravo 8, identify fabric rolls with smart QR codes, and handle multi-session workflows in real time.",
    },
    3: {
        "title": "🏬 WMS Operations & Sample Sewing",
        "description": "Optimize warehouse capacity (slotting), forecast inventory capacity, and integrate advanced sample-sewing workflows for mobile devices.",
    },
    4: {
        "title": "📊 BI Dashboard & Analytics",
        "description": "Visualize data on Smart TVs, provide intelligent decision-support reporting, and alert on risky slow-moving inventory.",
    },
    5: {
        "title": "🏗️ Finished Goods Design & Engine",
        "description": "Design PO/INV, location, and pallet models. Sync bidirectionally with Bravo 8 to keep data aligned.",
    },
    6: {
        "title": "🛡️ PO Management & Final QC",
        "description": "Identify goods with QR codes, organize outgoing quality-control checklists, and operate a dedicated customer portal.",
    },
    7: {
        "title": "🏢 WMS & Shipping Operations",
        "description": "Manage multi-location warehouses (bin/bay), optimize cubic-meter capacity, and verify carton and pallet status before shipment.",
    },
    8: {
        "title": "🔎 E2E Traceability & BI",
        "description": "Provide full visibility across the chain from PO to buyer and monitor real-time inventory through visual dashboards.",
    },
    9: {
        "title": "🏛️ Conveyor R&D V3",
        "description": "Create 3D technical designs, simulate operations, and optimize equipment installation positions at the factory.",
    },
    10: {
        "title": "🏷️ MTS & Recycling Management",
        "description": "Synchronize MTS labels with Bravo 8, control recycled-goods lifecycles, and apply automatic coding on the conveyor.",
    },
    11: {
        "title": "🧠 AI & Control Hub",
        "description": "Integrate AI cameras for ultra-fast QR and barcode recognition and upgrade Gen 2 firmware for the control system.",
    },
    12: {
        "title": "📊 Monitoring & Dashboard",
        "description": "Monitor conveyor status 24/7 through BI dashboards and report actual output on Smart TVs.",
    },
    13: {
        "title": "📅 Cutting Plan & Scheduling",
        "description": "Synchronize BOM and marker data from the office, plan production on the web, and issue accurate cutting markers to the factory.",
    },
    14: {
        "title": "✂️ Cutting Table Operations & Recut",
        "description": "Manage actual fabric spreading, reconcile issue slips, and handle recut operations transparently.",
    },
    15: {
        "title": "🏷️ Bundle Control (E-Ticket)",
        "description": "Identify bundles with QR codes, manage component and color matching, and print master tags integrated with big-data records.",
    },
    16: {
        "title": "⛓️ Traceability & Blockchain",
        "description": "Provide full traceability for fabric lots, production event timelines, and integrate blockchain technology for data security.",
    },
    17: {
        "title": "🏗️ SCADA & IoT Architecture",
        "description": "Design station maps (Visual Line), connect edge IoT devices, and standardize real-time SCADA data flows.",
    },
    18: {
        "title": "⚡ EFFIDAP & Station Monitoring",
        "description": "Automate EFFIDAP calculations, monitor output and payroll funds through RFID, and visualize productivity by individual.",
    },
    19: {
        "title": "🛡️ QC Quality & Rule Logic",
        "description": "Capture QC defects instantly, apply defect-conversion rules (<= 4.5%), and provide reports that support sewing-line improvement.",
    },
    20: {
        "title": "🔔 Andon & BI Dashboard",
        "description": "Operate an Andon alert system (Maintenance/Supply), provide multi-level drill-down dashboards, and present visual reporting on Smart TVs.",
    },
    21: {
        "title": "🧵 Accessories Ecosystem (Pillar 06)",
        "description": "Extend the control loop to accessories issued to the line, complete the MES ecosystem, and remain in the survey phase pending formal confirmation (TBC).",
    },
}


def fetch_rows(engine, table_name: str) -> list[dict[str, Any]]:
    with engine.connect() as conn:
        exists = conn.execute(text("SELECT to_regclass(:table_name)"), {"table_name": table_name}).scalar_one()
        if not exists:
            return []
        return [dict(row) for row in conn.execute(text(f"SELECT * FROM {table_name} ORDER BY id")).mappings().all()]


def build_kpis(rows: list[dict[str, Any]]) -> list[MESKPI]:
    translated = []
    for row in rows:
        translated.append(
            MESKPI(
                id=row["id"],
                icon=row["icon"],
                title=KPI_TITLE_TRANSLATIONS.get(row["id"], row["title"]),
                value=row["value"],
                impact_label=row["impact_label"],
                impact_color=row["impact_color"],
                order=row["order"],
                created_at=row["created_at"],
            )
        )
    return translated


def build_map_nodes(rows: list[dict[str, Any]]) -> list[MESMapNode]:
    translated = []
    for row in rows:
        copy = MAP_NODE_TRANSLATIONS.get(row["id"], {})
        translated.append(
            MESMapNode(
                id=row["id"],
                pillar=row["pillar"],
                title=copy.get("title", row["title"]),
                subtitle=row["subtitle"],
                description=copy.get("description", row["description"]),
                icon=row["icon"],
                color=row["color"],
                status=row["status"],
                status_color=row["status_color"],
                is_active=row["is_active"],
                order=row["order"],
                created_at=row["created_at"],
            )
        )
    return translated


def build_module_details(rows: list[dict[str, Any]]) -> list[MESModuleDetail]:
    translated = []
    for row in rows:
        copy = MODULE_DETAIL_TRANSLATIONS.get(row["id"], {})
        translated.append(
            MESModuleDetail(
                id=row["id"],
                pillar=row["pillar"],
                step_number=row["step_number"],
                title=copy.get("title", row["title"]),
                description=copy.get("description", row["description"]),
                icon=row["icon"],
                order=row["order"],
                created_at=row["created_at"],
            )
        )
    return translated


def sync_mes(source_url: str, target_url: str) -> None:
    source_engine = create_engine(source_url)
    target_engine = create_engine(target_url)
    TargetSession = sessionmaker(bind=target_engine, autoflush=False, autocommit=False)

    Base.metadata.create_all(bind=target_engine)

    source_kpis = fetch_rows(source_engine, "mes_kpis")
    source_map_nodes = fetch_rows(source_engine, "mes_map_nodes")
    source_module_details = fetch_rows(source_engine, "mes_module_details")
    source_mtcl = fetch_rows(source_engine, "mtcl")

    print(f"Source rows: mes_kpis={len(source_kpis)}, mes_map_nodes={len(source_map_nodes)}, mes_module_details={len(source_module_details)}")
    if not source_mtcl:
        print("Source table mtcl was not found on the main database. Leaving local mtcl unchanged.")

    with TargetSession() as session:
        session: Session
        session.query(MESModuleDetail).delete()
        session.query(MESMapNode).delete()
        session.query(MESKPI).delete()

        session.add_all(build_kpis(source_kpis))
        session.add_all(build_map_nodes(source_map_nodes))
        session.add_all(build_module_details(source_module_details))
        session.commit()

    print("MES data synced to target database in English.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync MES data from the main database to the local demo database in English.")
    parser.add_argument(
        "--source-url",
        default=os.getenv("MES_SOURCE_DATABASE_URL", SOURCE_DEFAULT),
        help="Source PostgreSQL URL. Defaults to MES_SOURCE_DATABASE_URL or the configured main server.",
    )
    parser.add_argument(
        "--target-url",
        default=os.getenv("SQLALCHEMY_DATABASE_URL", ""),
        help="Target PostgreSQL URL. Defaults to SQLALCHEMY_DATABASE_URL from .env.",
    )
    args = parser.parse_args()

    if not args.target_url:
        raise SystemExit("Target database URL is missing. Set SQLALCHEMY_DATABASE_URL or pass --target-url.")

    sync_mes(args.source_url, args.target_url)


if __name__ == "__main__":
    main()
