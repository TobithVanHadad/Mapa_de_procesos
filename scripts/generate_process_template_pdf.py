from __future__ import annotations

from pathlib import Path
from textwrap import wrap

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.acroform import AcroForm
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "machote-documentacion-procesos-orvel.pdf"
WEB_COPY = ROOT / "public" / "plantillas" / "machote-documentacion-procesos-orvel.pdf"

PAGE_W, PAGE_H = A4
MARGIN = 38
NAVY = HexColor("#103F6E")
NAVY_2 = HexColor("#174B7A")
GREEN = HexColor("#0B9B45")
GREEN_SOFT = HexColor("#EAF8EF")
BLUE_SOFT = HexColor("#EEF4F9")
INK = HexColor("#102A43")
MUTED = HexColor("#5D7388")
LINE = HexColor("#CFDCE7")
AMBER = HexColor("#D97706")
RED = HexColor("#C73E37")
WHITE = white


def rounded_box(c: canvas.Canvas, x: float, y: float, w: float, h: float, fill, stroke=LINE, radius=8):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.7)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, width: float, size=8.5,
                 leading=11, color=INK, font="Helvetica") -> float:
    c.setFont(font, size)
    c.setFillColor(color)
    approx = max(18, int(width / (size * 0.52)))
    for paragraph in text.split("\n"):
        lines = wrap(paragraph, width=approx, break_long_words=False, break_on_hyphens=False) or [""]
        for line in lines:
            c.drawString(x, y, line)
            y -= leading
        y -= 2
    return y


def page_header(c: canvas.Canvas, page: int, section: str, title: str):
    c.setFillColor(NAVY)
    c.rect(0, PAGE_H - 74, PAGE_W, 74, fill=1, stroke=0)
    c.setFillColor(GREEN)
    c.rect(0, PAGE_H - 78, PAGE_W, 4, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN, PAGE_H - 28, "DISTRIBUCIONES ORVEL  /  MAPA DE PROCESOS")
    c.setFont("Helvetica-Bold", 17)
    c.drawString(MARGIN, PAGE_H - 52, title)
    c.setFont("Helvetica", 7.5)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 50, section.upper())
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(MARGIN, 20, "Machote editable - Controlar como informacion documentada vigente")
    c.drawRightString(PAGE_W - MARGIN, 20, f"Pagina {page} de 9")


def text_field(c: canvas.Canvas, form: AcroForm, label: str, name: str, x: float, y: float,
               w: float, h: float = 21, multiline: bool = False, value: str = ""):
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Bold", 6.5)
    c.drawString(x, y + h + 4, label.upper())
    bare_text_field(c, form, name, x, y, w, h, multiline, value)


def bare_text_field(c: canvas.Canvas, form: AcroForm, name: str, x: float, y: float,
                    w: float, h: float, multiline: bool = False, value: str = ""):
    c.setFillColor(HexColor("#FBFDFF"))
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.rect(x, y, w, h, fill=1, stroke=1)
    form.textfield(
        name=name,
        value=value,
        x=x,
        y=y,
        width=w,
        height=h,
        borderColor=None,
        fillColor=None,
        textColor=INK,
        borderWidth=0,
        borderStyle="solid",
        fontName="Helvetica",
        fontSize=8,
        fieldFlags="multiline" if multiline else "",
        forceBorder=False,
    )


def checkbox(c: canvas.Canvas, form: AcroForm, label: str, name: str, x: float, y: float, checked=False,
             note: str | None = None):
    form.checkbox(
        name=name,
        x=x,
        y=y - 1,
        size=10,
        checked=checked,
        buttonStyle="check",
        borderColor=LINE,
        fillColor=WHITE,
        textColor=GREEN,
        forceBorder=True,
    )
    c.setFillColor(INK)
    c.setFont("Helvetica", 7.3)
    c.drawString(x + 15, y + 1, label)
    if note:
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Oblique", 6.2)
        c.drawString(x + 15, y - 8, note)


def section_title(c: canvas.Canvas, title: str, subtitle: str, y: float) -> float:
    c.setFillColor(GREEN)
    c.roundRect(MARGIN, y - 3, 4, 22, 2, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN + 12, y + 7, title)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawRightString(PAGE_W - MARGIN, y + 7, subtitle)
    return y - 15


def new_page(c: canvas.Canvas, page: int, section: str, title: str):
    if page > 1:
        c.showPage()
    page_header(c, page, section, title)


def create_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    WEB_COPY.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle("Machote universal de documentacion de procesos - Distribuciones Orvel")
    c.setAuthor("Distribuciones Orvel")
    c.setSubject("Plantilla rellenable alineada con el enfoque a procesos de ISO 9001:2015")
    form = c.acroForm

    # 1 - Cover and use
    new_page(c, 1, "Guia de uso", "Machote universal de procesos")
    rounded_box(c, MARGIN, 520, PAGE_W - 2 * MARGIN, 185, BLUE_SOFT, stroke=HexColor("#B9CDDE"), radius=14)
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(MARGIN + 22, 672, "MACHOTE RELLENABLE Y DESCARGABLE")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 25)
    c.drawString(MARGIN + 22, 632, "Documentacion de procesos")
    c.setFont("Helvetica", 11)
    c.setFillColor(MUTED)
    c.drawString(MARGIN + 22, 606, "Machote vacio para cualquier area de la organizacion")
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN + 22, 562, "Distribuciones Orvel")
    c.setFillColor(GREEN)
    c.circle(PAGE_W - MARGIN - 45, 610, 31, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(PAGE_W - MARGIN - 45, 604, "DO")

    y = section_title(c, "Como usar este documento", "Completar, revisar, aprobar y controlar version", 480)
    instructions = [
        ("1", "Identifique el proceso", "Defina nombre, area, objetivo, alcance, propietario, usuarios y resultado esperado."),
        ("2", "Dibuje la secuencia", "Registre las actividades principales, subprocesos, decisiones, personas, sistemas, documentos y salidas."),
        ("3", "Determine los controles", "Identifique entradas, criterios, responsabilidades, riesgos, requisitos aplicables y evidencia."),
        ("4", "Apruebe y mantenga", "Revise indicadores, desviaciones, acciones, cambios, vigencia y aprobacion del documento."),
    ]
    for number, title, description in instructions:
        rounded_box(c, MARGIN, y - 57, PAGE_W - 2 * MARGIN, 50, WHITE)
        c.setFillColor(NAVY)
        c.circle(MARGIN + 22, y - 32, 12, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(MARGIN + 22, y - 35, number)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(MARGIN + 43, y - 23, title)
        draw_wrapped(c, description, MARGIN + 43, y - 36, PAGE_W - 2 * MARGIN - 58, 7.2, 9, MUTED)
        y -= 59

    rounded_box(c, MARGIN, 89, PAGE_W - 2 * MARGIN, 74, GREEN_SOFT, stroke=HexColor("#B8E2C6"))
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN + 14, 143, "ALCANCE DE LA ALINEACION")
    draw_wrapped(
        c,
        "La plantilla esta vacia y puede usarse en etiquetado, almacen, contabilidad, compras, ventas, calidad, recursos humanos o cualquier otra area. Organiza informacion documentada, controles, riesgos, medicion y mejora con el enfoque a procesos de ISO 9001:2015 y su Enmienda 1:2024. No constituye certificacion ni sustituye requisitos legales o sectoriales aplicables.",
        MARGIN + 14, 128, PAGE_W - 2 * MARGIN - 28, 7.3, 9.2, INK,
    )

    # 2 - Identification
    new_page(c, 2, "01 / Identificacion", "Ficha general del proceso")
    y = section_title(c, "Identificacion y control documental", "ISO 9001: contexto, proceso e informacion documentada", 735)
    text_field(c, form, "Nombre del proceso", "process_name", MARGIN, y - 32, 330)
    text_field(c, form, "Codigo", "process_code", 380, y - 32, 177)
    y -= 66
    text_field(c, form, "Propietario del proceso", "process_owner", MARGIN, y - 32, 248)
    text_field(c, form, "Area", "process_area", 300, y - 32, 257)
    y -= 66
    text_field(c, form, "Version", "version", MARGIN, y - 32, 112)
    text_field(c, form, "Fecha de emision", "issue_date", 165, y - 32, 122)
    text_field(c, form, "Fecha de revision", "review_date", 305, y - 32, 122)
    text_field(c, form, "Vigencia / proxima revision", "document_status", 445, y - 32, 112)
    y -= 73
    text_field(c, form, "Objetivo", "objective", MARGIN, y - 65, PAGE_W - 2 * MARGIN, 51, True)
    y -= 101
    text_field(c, form, "Alcance - inicio, fin, ubicaciones y exclusiones", "scope", MARGIN, y - 65, PAGE_W - 2 * MARGIN, 51, True)
    y -= 101
    text_field(c, form, "Entradas principales", "main_inputs", MARGIN, y - 65, 248, 51, True)
    text_field(c, form, "Salidas principales", "main_outputs", 309, y - 65, 248, 51, True)
    y -= 101
    text_field(c, form, "Usuarios / partes interesadas", "customer", MARGIN, y - 32, 248)
    text_field(c, form, "Ubicacion / sede", "destination_country", 309, y - 32, 248)
    y -= 66
    text_field(c, form, "Producto / servicio / resultado", "product_lot", MARGIN, y - 32, 248)
    text_field(c, form, "Referencia relacionada", "order_reference", 309, y - 32, 248)
    y -= 66
    text_field(c, form, "Proceso anterior / proveedor", "incoterm", MARGIN, y - 32, 248)
    text_field(c, form, "Proceso siguiente / cliente interno", "transport_route", 309, y - 32, 248)

    # 3 - Blank process sequence
    new_page(c, 3, "02 / Secuencia", "Mapa en blanco del proceso")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(MARGIN, 726, "Escriba la secuencia principal. Agregue o elimine pasos segun la complejidad real del proceso.")
    card_w = 248
    card_h = 103
    gap_x = 23
    x_positions = [MARGIN, MARGIN + card_w + gap_x]
    y = 604
    for idx in range(10):
        num = f"{idx + 1:02d}"
        col = idx % 2
        if idx and col == 0:
            y -= card_h + 12
        x = x_positions[col]
        rounded_box(c, x, y, card_w, card_h, WHITE)
        c.setFillColor(GREEN if idx < 6 else NAVY)
        c.roundRect(x + 10, y + 70, 29, 20, 6, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(x + 24.5, y + 77, num)
        text_field(c, form, "Actividad / decision", f"sequence_{idx + 1}_activity", x + 48, y + 66, 189, 20)
        text_field(c, form, "Resultado / enlace al siguiente paso", f"sequence_{idx + 1}_output", x + 11, y + 24, 226, 20)
        c.setStrokeColor(LINE)
        c.setLineWidth(1)
        c.line(x + card_w - 14, y - 6, x + card_w + 14, y - 6)

    rounded_box(c, MARGIN, 70, PAGE_W - 2 * MARGIN, 48, GREEN_SOFT, stroke=HexColor("#B8E2C6"))
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(MARGIN + 12, 100, "RECUERDE")
    c.setFillColor(INK)
    c.setFont("Helvetica", 7)
    c.drawString(MARGIN + 12, 84, "Personas, sistemas y documentos apoyan la secuencia; no deben confundirse con las etapas principales.")

    # 4 - SIPOC and roles
    new_page(c, 4, "03 / Caracterizacion", "SIPOC, criterios y responsables")
    y = section_title(c, "SIPOC del proceso", "Defina proveedores, entradas, actividades, salidas y clientes", 735)
    labels = ["Proveedores", "Entradas", "Proceso / actividades clave", "Salidas", "Clientes"]
    names = ["sipoc_suppliers", "sipoc_inputs", "sipoc_process", "sipoc_outputs", "sipoc_customers"]
    for label, name in zip(labels, names):
        text_field(c, form, label, name, MARGIN, y - 50, PAGE_W - 2 * MARGIN, 36, True)
        y -= 69
    y -= 3
    y = section_title(c, "Responsabilidad y autoridad", "Quien ejecuta, aprueba, consulta y recibe informacion", y)
    text_field(c, form, "Responsable de ejecutar", "role_responsible", MARGIN, y - 32, 248)
    text_field(c, form, "Responsable de aprobar", "role_accountable", 309, y - 32, 248)
    y -= 66
    text_field(c, form, "Consultados", "role_consulted", MARGIN, y - 32, 248)
    text_field(c, form, "Informados", "role_informed", 309, y - 32, 248)
    y -= 72
    text_field(c, form, "Criterios de aceptacion y liberacion", "acceptance_criteria", MARGIN, y - 65, PAGE_W - 2 * MARGIN, 51, True)
    y -= 101
    text_field(c, form, "Recursos, competencias, infraestructura y sistemas", "resources_competence", MARGIN, y - 65, PAGE_W - 2 * MARGIN, 51, True)

    # 5 - Operational record
    new_page(c, 5, "04 / Operacion", "Registro de etapas y evidencia")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.2)
    c.drawString(MARGIN, 726, "Use una fila por etapa critica o duplique esta pagina para desarrollar el proceso completo.")
    y = 680
    for row in range(1, 5):
        rounded_box(c, MARGIN, y - 132, PAGE_W - 2 * MARGIN, 124, BLUE_SOFT if row % 2 else WHITE)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(MARGIN + 12, y - 23, f"ETAPA {row}")
        text_field(c, form, "Actividad / criterio", f"stage_{row}_activity", MARGIN + 64, y - 31, 286, 19)
        text_field(c, form, "Responsable", f"stage_{row}_owner", MARGIN + 363, y - 31, 144, 19)
        text_field(c, form, "Entrada y salida", f"stage_{row}_io", MARGIN + 12, y - 72, 238, 25, True)
        text_field(c, form, "Control / riesgo", f"stage_{row}_control", MARGIN + 263, y - 72, 244, 25, True)
        text_field(c, form, "Evidencia / ubicacion", f"stage_{row}_evidence", MARGIN + 12, y - 113, 337, 22)
        text_field(c, form, "Fecha / resultado", f"stage_{row}_result", MARGIN + 363, y - 113, 144, 22)
        y -= 139

    rounded_box(c, MARGIN, 84, PAGE_W - 2 * MARGIN, 38, GREEN_SOFT, stroke=HexColor("#B8E2C6"))
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(MARGIN + 12, 106, "PUNTO DE CONTROL")
    c.setFillColor(INK)
    c.setFont("Helvetica", 7)
    c.drawString(MARGIN + 12, 93, "No liberar la siguiente etapa si falta el criterio, la evidencia o la autorizacion definida.")

    # 6 - Compliance and risk applicability
    new_page(c, 6, "05 / Riesgo y cumplimiento", "Matriz de aplicabilidad")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.2)
    c.drawString(MARGIN, 726, "Marque primero si aplica. Despues documente requisito, evidencia, responsable y verificacion.")
    items = [
        ("Requisitos del cliente o usuario", "Especificaciones, acuerdos, servicio, tiempos y criterios de aceptacion.", False),
        ("ISO 9001:2015 + Amd 1:2024", "Proceso, requisitos, informacion documentada, control, medicion y mejora.", False),
        ("Requisitos legales y regulatorios", "Leyes, reglamentos, permisos, registros y autoridades aplicables.", False),
        ("Seguridad y salud - ISO 45001", "Peligros, controles operativos, competencia y respuesta a emergencias.", False),
        ("Ambiental - ISO 14001", "Aspectos e impactos, obligaciones, controles y situaciones de emergencia.", False),
        ("Informacion y privacidad - ISO/IEC 27001", "Acceso, confidencialidad, integridad, disponibilidad y retencion.", False),
        ("Fiscal, contable y financiero", "Autorizaciones, segregacion, evidencia, conciliacion y conservacion.", False),
        ("Calidad de producto o servicio", "Especificaciones, inspeccion, liberacion y control de no conformidad.", False),
        ("Comercio exterior y cadena de suministro", "Aduana, transporte, seguridad, embalaje y requisitos por ruta si aplica.", False),
        ("Otro requisito sectorial o interno", "Politicas, contratos, normas tecnicas o controles propios del area.", False),
    ]
    y = 683
    for idx, (title, note, checked) in enumerate(items, 1):
        rounded_box(c, MARGIN, y - 43, PAGE_W - 2 * MARGIN, 38, WHITE)
        checkbox(c, form, title, f"applicable_{idx}", MARGIN + 10, y - 20, checked, note)
        y -= 47
    y -= 3
    text_field(c, form, "Requisitos legales, contractuales y del cliente identificados", "requirements_register", MARGIN, y - 58, PAGE_W - 2 * MARGIN, 44, True)
    y -= 92
    text_field(c, form, "Riesgos, oportunidades, controles y plan de contingencia", "risks_controls", MARGIN, y - 58, PAGE_W - 2 * MARGIN, 44, True)

    # 7 - Evidence checklist
    new_page(c, 7, "06 / Expediente", "Registros y documentos del proceso")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.2)
    c.drawString(MARGIN, 726, "Complete solo los registros que el proceso necesita y defina su ubicacion, acceso, retencion y version.")
    y = 687
    for idx in range(1, 21):
        col = 0 if idx <= 10 else 1
        local_idx = idx - 1 if col == 0 else idx - 11
        x = MARGIN if col == 0 else 309
        yy = y - local_idx * 54
        rounded_box(c, x, yy - 46, 248, 51, WHITE)
        form.checkbox(
            name=f"evidence_{idx}",
            x=x + 9,
            y=yy - 16,
            size=10,
            checked=False,
            buttonStyle="check",
            borderColor=LINE,
            fillColor=WHITE,
            textColor=GREEN,
            forceBorder=True,
        )
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 5.4)
        c.drawString(x + 25, yy - 6, "DOCUMENTO / REGISTRO")
        bare_text_field(c, form, f"evidence_name_{idx}", x + 25, yy - 22, 210, 13)
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 5.2)
        c.drawString(x + 25, yy - 31, "UBICACION / RETENCION")
        bare_text_field(c, form, f"evidence_ref_{idx}", x + 25, yy - 43, 210, 10)

    y2 = 118
    text_field(c, form, "Ubicacion oficial del expediente y periodo de retencion", "record_location_retention", MARGIN, y2 - 30, PAGE_W - 2 * MARGIN, 21)
    text_field(c, form, "Responsable del expediente", "record_custodian", MARGIN, y2 - 68, 248, 21)
    text_field(c, form, "Acceso / confidencialidad", "record_access", 309, y2 - 68, 248, 21)

    # 8 - Performance and improvement
    new_page(c, 8, "07 / Evaluacion", "Indicadores, desviaciones y mejora")
    y = section_title(c, "Indicadores del proceso", "Defina formula, meta, fuente, frecuencia y responsable", 735)
    for row in range(1, 5):
        rounded_box(c, MARGIN, y - 59, PAGE_W - 2 * MARGIN, 52, WHITE)
        text_field(c, form, "Indicador", f"kpi_{row}_name", MARGIN + 10, y - 48, 175, 20)
        text_field(c, form, "Formula / fuente", f"kpi_{row}_formula", MARGIN + 198, y - 48, 155, 20)
        text_field(c, form, "Meta / frecuencia", f"kpi_{row}_target", MARGIN + 366, y - 48, 143, 20)
        y -= 66
    y -= 7
    y = section_title(c, "No conformidad y accion correctiva", "Registrar contencion, causa, accion y eficacia", y)
    text_field(c, form, "Desviacion / reclamo / folio", "nc_description", MARGIN, y - 58, PAGE_W - 2 * MARGIN, 44, True)
    y -= 92
    text_field(c, form, "Contencion inmediata", "nc_containment", MARGIN, y - 48, 248, 34, True)
    text_field(c, form, "Analisis de causa", "nc_root_cause", 309, y - 48, 248, 34, True)
    y -= 82
    text_field(c, form, "Accion correctiva / responsable / fecha", "nc_action", MARGIN, y - 48, 248, 34, True)
    text_field(c, form, "Verificacion de eficacia", "nc_effectiveness", 309, y - 48, 248, 34, True)
    y -= 88
    y = section_title(c, "Aprobacion y control de cambios", "Conservar evidencia de revision y autorizacion", y)
    text_field(c, form, "Elaboro / fecha", "approval_prepared", MARGIN, y - 32, 160)
    text_field(c, form, "Reviso / fecha", "approval_reviewed", 218, y - 32, 160)
    text_field(c, form, "Aprobo / fecha", "approval_approved", 397, y - 32, 160)
    y -= 66
    text_field(c, form, "Resumen de cambios de esta version", "change_summary", MARGIN, y - 48, PAGE_W - 2 * MARGIN, 34, True)

    # 9 - Foundation and sources
    new_page(c, 9, "08 / Fundamentacion", "Referencias y criterios de aplicacion")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.3)
    c.drawString(MARGIN, 726, "Referencias oficiales consultadas al 22 de julio de 2026. Verifique cambios antes de cada revision.")
    sources = [
        ("ISO 9001:2015 y Amd 1:2024", "Estructura de gestion de calidad: contexto, liderazgo, planificacion, apoyo, operacion, evaluacion y mejora. La enmienda incorpora la consideracion del cambio climatico en el contexto y partes interesadas.", "https://www.iso.org/standard/62085.html  |  https://www.iso.org/standard/88431.html"),
        ("ISO 10013:2021", "Guia para desarrollar y mantener la informacion documentada necesaria para un sistema de gestion, adaptada a las necesidades reales de la organizacion.", "https://www.iso.org/standard/75736.html"),
        ("ISO 31000:2018", "Principios y directrices para identificar, analizar, evaluar, tratar, monitorear y comunicar riesgos en cualquier organizacion o proceso.", "https://www.iso.org/standard/65694.html"),
        ("ISO 19011:2026", "Guia vigente para principios de auditoria, programas de auditoria, realizacion de auditorias y competencia de quienes participan.", "https://www.iso.org/standard/19011"),
        ("ISO 45001:2018 y Amd 1:2024", "Marco aplicable cuando el proceso pueda afectar la seguridad y salud en el trabajo. Verificar tambien requisitos legales locales.", "https://www.iso.org/standard/63787.html  |  https://www.iso.org/standard/88428.html"),
        ("ISO 14001:2026", "Marco vigente para identificar y gestionar aspectos, impactos, obligaciones y desempeño ambiental relacionados con el proceso.", "https://www.iso.org/standard/14001"),
        ("ISO/IEC 27001:2022 y Amd 1:2024", "Requisitos para gestionar riesgos de confidencialidad, integridad y disponibilidad de informacion en procesos fisicos o digitales.", "https://www.iso.org/standard/27001  |  https://www.iso.org/standard/88435.html"),
    ]
    y = 678
    for title, explanation, url in sources:
        rounded_box(c, MARGIN, y - 66, PAGE_W - 2 * MARGIN, 59, WHITE)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 8.2)
        c.drawString(MARGIN + 12, y - 21, title)
        draw_wrapped(c, explanation, MARGIN + 12, y - 34, PAGE_W - 2 * MARGIN - 24, 6.3, 7.5, INK)
        c.setFillColor(GREEN)
        c.setFont("Helvetica", 5.3)
        c.drawString(MARGIN + 12, y - 57, url)
        y -= 70

    rounded_box(c, MARGIN, 72, PAGE_W - 2 * MARGIN, 69, HexColor("#FFF7ED"), stroke=HexColor("#F0C58E"))
    c.setFillColor(AMBER)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(MARGIN + 12, 122, "DECISION DE APLICABILIDAD")
    draw_wrapped(
        c,
        "El propietario del proceso debe determinar que normas, leyes, contratos, politicas y requisitos de cliente aplican a su area. Para exportacion, por ejemplo, pueden requerirse Incoterms, aduana, ISO 28000, NIMF 15, SOLAS/VGM o CTU Code; para otras areas aplicaran referencias distintas. Este machote no garantiza por si solo conformidad legal ni certificacion ISO.",
        MARGIN + 12, 107, PAGE_W - 2 * MARGIN - 24, 7, 9, INK,
    )

    c.save()
    WEB_COPY.write_bytes(OUTPUT.read_bytes())
    print(OUTPUT)
    print(WEB_COPY)


if __name__ == "__main__":
    create_pdf()
