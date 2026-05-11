import sys
import os

# Add the current directory to sys.path so we can import modules
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from database import engine, SessionLocal, Base
from models import MESKPI, MESMapNode, MESModuleDetail
from sqlalchemy.orm import Session

def seed_data(db: Session):
    # KPIs
    kpis = [
        MESKPI(icon="📄", title="Giảm Thao tác giấy", value="70–90%", impact_label="High Impact", impact_color="rose-500", order=1),
        MESKPI(icon="📈", title="Tăng Năng suất chuyền", value="5–12%", impact_label="Optimized", impact_color="emerald-500", order=2),
        MESKPI(icon="🛡️", title="Giảm Lỗi lặp lại", value="30–50%", impact_label="Reduced", impact_color="amber-500", order=3),
        MESKPI(icon="⚡", title="Xử lý dữ liệu nhanh", value="3–5x", impact_label="Accelerated", impact_color="blue-500", order=4),
        MESKPI(icon="💰", title="Chính xác Quỹ lương", value="100%", impact_label="Precise", impact_color="teal-500", order=5),
        MESKPI(icon="🔗", title="Truy xuất nguồn gốc", value="E2E", impact_label="Verified", impact_color="indigo-500", order=6),
    ]
    
    # Map Nodes (Pillars)
    map_nodes = [
        MESMapNode(pillar=1, title="Kho Nguyên liệu", subtitle="QR Inventory Hub", description="Số hóa toàn diện vòng đời nguyên phụ liệu.", icon="📦", color="blue", status="Active", status_color="emerald-600", order=1),
        MESMapNode(pillar=2, title="Kho Thành phẩm", subtitle="E2E Global Link", description="Kiểm soát chất lượng đầu ra và minh bạch hóa toàn bộ chuỗi PO → Pallet → Buyer.", icon="📤", color="pink", status="Active", status_color="emerald-600", order=2),
        MESMapNode(pillar=3, title="Module GTD", subtitle="AI Vision Tracking", description="Kiểm soát tiêu chuẩn giao hàng GTD của Decathlon bằng hệ thống băng chuyền tích hợp AI Camera.", icon="🔍", color="orange", status="Active", status_color="emerald-600", order=3),
        MESMapNode(pillar=4, title="Số hoá Tổ cắt", subtitle="Marker Precision", description="Kiểm soát hao hụt và minh bạch hóa dữ liệu từ Marker đến Bán thành phẩm.", icon="✂️", color="emerald", status="Active", status_color="emerald-600", order=4),
        MESMapNode(pillar=5, title="Năng suất Chuyền may", subtitle="IoT Real-time", description="Trực quan hóa chuyền sản xuất theo thời gian thực, tích hợp IoT & Andon.", icon="🏭", color="purple", status="Deploying", status_color="purple-600", order=5),
        MESMapNode(pillar=6, title="Kho Phụ liệu", subtitle="Full Ecosystem", description="Mở rộng vòng kiểm soát sang phụ liệu nhập chuyền, hoàn thiện hệ sinh thái MES.", icon="🧵", color="slate", status="To be confirmed", status_color="slate-400", order=6),
    ]
    
    # Module Details (Steps)
    details = [
        # Pillar 1
        MESModuleDetail(pillar=1, step_number="Step 01", title="🏗️ Thiết lập Hệ thống & Engine", description="Xây dựng kiến trúc Framework bền vững, thiết kế Database models hiệu năng cao và phát triển Engine đồng bộ liên kết toàn diện hệ thống Hachiba APP.", order=1),
        MESModuleDetail(pillar=1, step_number="Step 02", title="🔄 Quản lý Nhập Xuất & QR Hub", description="Số hóa quy trình Inbound/Outbound từ Bravo 8, định danh kiện vải bằng mã QR thông minh và xử lý đa phiên làm việc (Multi-session) thời gian thực.", order=2),
        MESModuleDetail(pillar=1, step_number="Step 03", title="🏬 Vận hành WMS & May mẫu", description="Tối ưu hóa sức chứa kho (Slotting), dự báo năng lực tồn kho và tích hợp quy trình may mẫu chuyên sâu cho thiết bị di động.", order=3),
        MESModuleDetail(pillar=1, step_number="Step 04", title="📊 Dashboard BI & Phân tích", description="Trực quan hóa dữ liệu qua Smart TV, báo cáo thông minh hỗ trợ ra quyết định và hệ thống cảnh báo hàng tồn rủi ro (Slow-moving).", order=4),
        
        # Pillar 2
        MESModuleDetail(pillar=2, step_number="Step 01", title="🏗️ Thiết kế & Engine TP", description="Thiết kế models PO/INV, vị trí và pallet. Đồng bộ 2 chiều với hệ thống Bravo 8 để đảm bảo dữ liệu luôn khớp.", order=1),
        MESModuleDetail(pillar=2, step_number="Step 02", title="🛡️ Quản lý PO & Final QC", description="Định danh hàng hóa bằng QR, tổ chức Checklist kiểm soát chất lượng đầu ra và vận hành Portal dành riêng cho khách hàng.", order=2),
        MESModuleDetail(pillar=2, step_number="Step 03", title="🏢 WMS & Vận hành Xuất hàng", description="Quản lý kho đa điểm (Bin/Bay), tối ưu sức chứa m3 và kiểm tra trạng thái Carton/Pallet trước khi xuất xưởng.", order=3),
        MESModuleDetail(pillar=2, step_number="Step 04", title="🔎 E2E Traceability & BI", description="Minh bạch hóa toàn bộ chuỗi từ PO đến Buyer. Giám sát tồn kho Real-time qua Dashboard trực quan.", order=4),
        
        # Pillar 3
        MESModuleDetail(pillar=3, step_number="Step 01", title="🏛️ R&D Băng Chuyền V3", description="Thiết kế kỹ thuật 3D, mô phỏng vận hành và tối ưu hóa vị trí lắp đặt thiết bị tại nhà máy.", order=1),
        MESModuleDetail(pillar=3, step_number="Step 02", title="🏷️ Quản lý MTS & Tái Chế", description="Đồng bộ nhãn MTS với Bravo 8, kiểm soát vòng đời hàng tái chế và gán mã tự động trên băng chuyền.", order=2),
        MESModuleDetail(pillar=3, step_number="Step 03", title="🧠 AI & Control Hub", description="Tích hợp AI Camera nhận diện QR/Barcode siêu tốc và nâng cấp Firmware Gen 2 cho hệ thống điều khiển.", order=3),
        MESModuleDetail(pillar=3, step_number="Step 04", title="📊 Monitoring & Dashboard", description="Giám sát trạng thái băng chuyền 24/7 qua Dashboard BI và thống kê sản lượng thực tế qua TV Smart.", order=4),
        
        # Pillar 4
        MESModuleDetail(pillar=4, step_number="Step 01", title="📅 Kế hoạch & Điều độ Cắt", description="Đồng bộ BOM/Marker từ văn phòng, lập kế hoạch sản xuất Web và cấp phát sơ đồ cắt chuẩn xác cho nhà máy.", order=1),
        MESModuleDetail(pillar=4, step_number="Step 02", title="✂️ Vận hành Bàn cắt & Thay thân", description="Quản lý trải vải thực tế, đối soát phiếu ra hàng và xử lý nghiệp vụ thay thân (Recut) minh bạch.", order=2),
        MESModuleDetail(pillar=4, step_number="Step 03", title="🏷️ Bundle Control (E-Ticket)", description="Định danh QR bó hàng, quản lý phối kiện/màu và in thẻ chính tích hợp dữ liệu Big Data.", order=3),
        MESModuleDetail(pillar=4, step_number="Step 04", title="⛓️ Traceability & Blockchain", description="Truy xuất toàn diện LOT vải, timeline sự kiện sản xuất và tích hợp công nghệ Blockchain bảo mật dữ liệu.", order=4),
        
        # Pillar 5
        MESModuleDetail(pillar=5, step_number="Step 01", title="🏗️ Kiến trúc SCADA & IoT", description="Thiết kế bản đồ trạm (Visual Line), kết nối thiết bị IoT đầu cuối và chuẩn hóa luồng dữ liệu SCADA thời gian thực.", order=1),
        MESModuleDetail(pillar=5, step_number="Step 02", title="⚡ EFFIDAP & Monitoring trạm", description="Engine tính toán EFFIDAP tự động, giám sát sản lượng/quỹ lương qua RFID và trực quan hóa năng suất theo từng cá nhân.", order=2),
        MESModuleDetail(pillar=5, step_number="Step 03", title="🛡️ QC Quality & Rule Logic", description="Ghi nhận lỗi QC tức thì, áp dụng Engine chuyển đổi lỗi (≤ 4.5%) và cung cấp báo cáo hỗ trợ cải tiến chuyền may.", order=3),
        MESModuleDetail(pillar=5, step_number="Step 04", title="🔔 Andon & BI Dashboard", description="Hệ thống cảnh báo Andon (Maintenance/Supply), Dashboard Drill-down đa cấp và trình chiếu trực quan qua TV Smart.", order=4),
        
        # Pillar 6
        MESModuleDetail(pillar=6, step_number="Roadmap", title="🧵 Hệ sinh thái Phụ Liệu (Pillar 06)", description="Mở rộng vòng kiểm soát sang phụ liệu nhập chuyền, hoàn thiện hệ sinh thái MES. Hiện đang trong giai đoạn khảo sát và chờ xác nhận chính thức (TBC).", order=1),
    ]
    
    db.add_all(kpis)
    db.add_all(map_nodes)
    db.add_all(details)
    db.commit()
    print("Seeded MES content successfully.")

def init_mes():
    # Ensure tables are created
    Base.metadata.create_all(bind=engine)
    print("Tables created.")
    
    db = SessionLocal()
    try:
        # Check if already seeded
        if db.query(MESKPI).first():
            print("Data already seeded.")
        else:
            seed_data(db)
    finally:
        db.close()

if __name__ == "__main__":
    init_mes()
