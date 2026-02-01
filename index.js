import express from "express";
import axios from "axios";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */
const WA_URL = `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;
const TOKEN = process.env.WHATSAPP_TOKEN;

const SHEET_URL = process.env.GOOGLE_SHEET_URL; // Apps Script (write)
const SHEET_ID = process.env.SHEET_ID;          // Google Sheet ID (read)

const VENDOR_PHONE = "+919876543210";

/* ================= GOOGLE SHEETS (READ) ================= */
const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);

/* ================= IN-MEMORY SESSIONS ================= */
const sessions = {}; // resets on restart

/* ================= HELPERS ================= */
async function send(payload) {
  await axios.post(WA_URL, payload, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}

const sendText = (to, body) =>
  send({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });

/* ================= MENUS ================= */
async function mainMenu(to) {
  sessions[to] = { step: "MENU" };
  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "🥛 Bala Milk Store" },
      body: { text: "What would you like to do?" },
      action: {
        button: "Options",
        sections: [
          {
            title: "Order Milk & More",
            rows: [
              { id: "NEW_ORDER", title: "🛒 New Order" },
              { id: "MANAGE", title: "⚙️ Manage Orders" },
            ],
          },
        ],
      },
    },
  });
}

async function productMenu(to) {
  sessions[to].step = "PRODUCT";
  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Choose product" },
      action: {
        button: "Products",
        sections: [
          {
            title: "Daily Essentials",
            rows: [
              { id: "BUFFALO", title: "Buffalo Milk", description: "₹100 / L" },
              { id: "COW", title: "Cow Milk", description: "₹70 / L" },
            ],
          },
        ],
      },
    },
  });
}

async function quantityMenu(to, product) {
  const s = sessions[to];
  s.step = "QTY";
  s.product = product;

  const map = {
    BUFFALO: [
      { id: "1L|100", title: "1 Liter", description: "₹100" },
      { id: "2L|200", title: "2 Liter", description: "₹200" },
    ],
    COW: [
      { id: "1L|70", title: "1 Liter", description: "₹70" },
      { id: "2L|140", title: "2 Liter", description: "₹140" },
    ],
  };

  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Select quantity" },
      action: {
        button: "Quantity",
        sections: [{ title: "Options", rows: map[product] }],
      },
    },
  });
}

async function summary(to) {
  const s = sessions[to];
  s.step = "CONFIRM";

  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          `🧾 *Order Summary*\n\n` +
          `Product: ${s.product}\n` +
          `Quantity: ${s.quantity}\n` +
          `Price: ₹${s.price}`,
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: "CONFIRM", title: "✅ Confirm" } },
          { type: "reply", reply: { id: "CANCEL", title: "❌ Cancel" } },
        ],
      },
    },
  });
}

/* ================= WEBHOOK ================= */
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const replyId =
      msg.interactive?.list_reply?.id ||
      msg.interactive?.button_reply?.id;

    if (!sessions[from]) {
      await mainMenu(from);
      return res.sendStatus(200);
    }

    const s = sessions[from];

    if (replyId === "NEW_ORDER") return productMenu(from);

    if (s.step === "PRODUCT") return quantityMenu(from, replyId);

    if (s.step === "QTY") {
      const [qty, price] = replyId.split("|");
      s.quantity = qty;
      s.price = price;
      return summary(from);
    }

    if (s.step === "CONFIRM") {
      if (replyId === "CONFIRM") {
        await axios.post(SHEET_URL, {
          phone: from,
          product: s.product,
          quantity: s.quantity,
          price: s.price,
          date: new Date().toISOString().split("T")[0],
        });

        await sendText(from, "✅ Order placed successfully!");
      } else {
        await sendText(from, "❌ Order cancelled");
      }
      delete sessions[from];
    }

    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(200);
  }
});

/* ================= DASHBOARD ================= */
app.get("/dashboard", async (req, res) => {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    let html = `<h2>Bala Milk Orders</h2><table border="1"><tr>
      <th>Date</th><th>Phone</th><th>Product</th><th>Qty</th><th>Price</th>
    </tr>`;

    rows.forEach(r => {
      html += `<tr>
        <td>${r.get("date")}</td>
        <td>${r.get("phone")}</td>
        <td>${r.get("product")}</td>
        <td>${r.get("quantity")}</td>
        <td>${r.get("price")}</td>
      </tr>`;
    });

    html += "</table>";
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Dashboard error");
  }
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
