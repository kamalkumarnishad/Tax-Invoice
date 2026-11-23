import "server-only";
import path from "node:path";
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InvoiceView } from "@/lib/invoice-view";

// Each file covers some scripts. A character is taken from the first that has it.
const scripts = ["latin", "latin-ext", "devanagari", "cyrillic", "greek", "vietnamese"];
const families = scripts.map((script) => `Noto ${script}`);

const LONGEST_PART = 24;

let ready = false;
function registerFonts() {
  if (ready) return;
  const file = (script: string, weight: number) =>
    path.join(process.cwd(), "assets", "fonts", `noto-sans-${script}-${weight}-normal.woff`);
  scripts.forEach((script, index) => {
    Font.register({
      family: families[index]!,
      fonts: [400, 700].map((fontWeight) => ({ src: file(script, fontWeight), fontWeight })),
    });
  });
  // No hyphens, but a very long word may break so it cannot run off the page.
  Font.registerHyphenationCallback((word) => word.match(new RegExp(`.{1,${LONGEST_PART}}`, "gsu")) ?? [word]);
  ready = true;
}

const ink = "#0f172a";
const soft = "#56657b";
const rule = "#e2e8f0";

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontFamily: families, fontSize: 9.5, color: ink },
  // Not on the page: text made by `render` (the page number) vanishes when it inherits a line height.
  body: { fontSize: 9.5, lineHeight: 1.45 },
  between: { flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 20, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 },
  soft: { color: soft },
  bold: { fontWeight: 700 },
  parties: { flexDirection: "row", gap: 24, marginTop: 24 },
  party: { flex: 1 },
  head: { flexDirection: "row", marginTop: 24, paddingBottom: 5, borderBottom: `1pt solid ${ink}` },
  row: { flexDirection: "row", paddingVertical: 6, borderBottom: `1pt solid ${rule}` },
  description: { flex: 1, paddingRight: 12 },
  quantity: { width: 60, textAlign: "right" },
  price: { width: 95, textAlign: "right" },
  amount: { width: 95, textAlign: "right" },
  summary: { width: 230, marginLeft: "auto", marginTop: 12, gap: 3 },
  total: { borderTop: `1pt solid ${ink}`, paddingTop: 5, marginTop: 3, fontSize: 12, fontWeight: 700 },
  section: { marginTop: 18 },
  mark: { fontSize: 11, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase" },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: soft,
  },
  // The text is only known once pages are laid out, so it needs its space set beforehand.
  pageNumber: { width: 120, height: 12, textAlign: "right" },
});

function Party({ heading, name, lines }: { heading: string; name: string; lines: string[] }) {
  return (
    <View style={styles.party}>
      <Text style={styles.soft}>{heading}</Text>
      <Text style={styles.bold}>{name}</Text>
      {lines.map((line, index) => (
        <Text key={index} style={styles.soft}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function Section({ heading, lines }: { heading: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.bold}>{heading}</Text>
      {lines.map((line, index) => (
        <Text key={index} style={styles.soft}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function InvoiceDocument({ view }: { view: InvoiceView }) {
  return (
    <Document title={`${view.title} ${view.number}`} author={view.from.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.body}>
          <View style={styles.between}>
            <View>
              <Text style={styles.title}>{view.title}</Text>
              <Text style={styles.soft}>{view.number}</Text>
              {view.watermark && <Text style={styles.mark}>{view.watermark}</Text>}
            </View>
            <View style={{ width: 170 }}>
              {view.dates.map(({ label, value }) => (
                <View key={label} style={styles.between}>
                  <Text style={styles.soft}>{label}</Text>
                  <Text>{value}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.parties}>
            <Party heading="From" {...view.from} />
            <Party heading="To" {...view.to} />
          </View>
          <View style={[styles.head, styles.bold]} fixed>
            <Text style={styles.description}>Description</Text>
            <Text style={styles.quantity}>Quantity</Text>
            <Text style={styles.price}>Unit price</Text>
            <Text style={styles.amount}>Amount</Text>
          </View>
          {view.items.map((item) => (
            <View key={item.id} style={styles.row} wrap={false}>
              <Text style={styles.description}>{item.description}</Text>
              <Text style={styles.quantity}>{item.quantity}</Text>
              <Text style={styles.price}>{item.unitPrice}</Text>
              <Text style={styles.amount}>{item.amount}</Text>
            </View>
          ))}
          <View style={styles.summary} wrap={false}>
            {view.summary.map(({ label, value }) => (
              <View key={label} style={styles.between}>
                <Text style={styles.soft}>{label}</Text>
                <Text>{value}</Text>
              </View>
            ))}
            <View style={[styles.between, styles.total]}>
              <Text>Total</Text>
              <Text>{view.total}</Text>
            </View>
            {view.settled && (
              <>
                <View style={styles.between}>
                  <Text style={styles.soft}>Paid</Text>
                  <Text>{view.settled.paid}</Text>
                </View>
                <View style={[styles.between, styles.bold]}>
                  <Text>Balance due</Text>
                  <Text>{view.settled.due}</Text>
                </View>
              </>
            )}
          </View>
          <Section heading="Tax details" lines={view.details} />
          <Section heading="How to pay" lines={view.payment} />
          <Section heading="Notes" lines={view.notes} />
        </View>
        <View style={styles.footer} fixed>
          <Text>{view.number}</Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export function renderInvoicePdf(view: InvoiceView): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<InvoiceDocument view={view} />);
}
