import express from "express";
import axios from "axios";
import { GoogleSpreadsheet } from "google-spreadsheet";

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */
const WA_URL = `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;
const TOKEN = process.env.WHATSAPP_TOKEN;
const SHEET_URL = process.env.GOOGLE_SHEET_URL;           // write webhook
const SHEET_ID = process.env.SHEET_ID;                    // for reading dashboard
const VENDOR_PHONE = "+919876543210";                     // fallback contact

/* Google Sheets setup for dashboard */
const doc = new GoogleSpreadsheet(SHEET_ID);
doc.useServiceAccountAuth({
  client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
});

/* ================= IN-MEMORY SESSIONS ================= */
const sessions = {}; // ⚠️ resets on restart — use Redis/DB in prod

/* ================= HELPERS ================= */
async function send(payload) {
  try {
    await axios.post(WA_URL, payload, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("Send failed:", err.response?.data || err.message);
  }
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
  sessions[to] = { step: "MENU", createdAt: Date.now() };
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
              { id: "MANAGE", title: "⚙️ Manage Orders", description: "Change / Cancel / Pause" },
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
      header: { type: "text", text: "🥛 Bala Milk Store" },
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
          {
            title: "Value Added",
            rows: [
              { id: "PANEER", title: "Paneer", description: "₹400 / Kg" },
              { id: "GHEE", title: "Ghee", description: "₹900 / Kg" },
              { id: "CURD", title: "Curd", description: "₹80 / 500g" },
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
      { id: "500ml|50", title: "500 ml", description: "₹50" },
      { id: "1L|100", title: "1 Liter", description: "₹100" },
      { id: "1.5L|150", title: "1.5 Liter", description: "₹150" },
      { id: "2L|200", title: "2 Liter", description: "₹200" },
    ],
    COW: [
      { id: "500ml|35", title: "500 ml", description: "₹35" },
      { id: "1L|70", title: "1 Liter", description: "₹70" },
      { id: "2L|140", title: "2 Liter", description: "₹140" },
    ],
    PANEER: [
      { id: "250g|100", title: "250 g", description: "₹100" },
      { id: "500g|200", title: "500 g", description: "₹200" },
      { id: "1kg|400", title: "1 Kg", description: "₹400" },
    ],
    GHEE: [
      { id: "250g|225", title: "250 g", description: "₹225" },
      { id: "500g|450", title: "500 g", description: "₹450" },
    ],
    CURD: [
      { id: "500g|80", title: "500 g", description: "₹80" },
      { id: "1kg|150", title: "1 Kg", description: "₹150" },
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
        sections: [{ title: "Options", rows: map[product] || [] }],
      },
    },
  });
}

async function subscriptionMenu(to) {
  sessions[to].step = "SUBSCRIPTION";
  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "How often do you want this?" },
      action: {
        button: "Frequency",
        sections: [
          {
            title: "Subscription Options",
            rows: [
              { id: "DAILY", title: "Daily", description: "Every morning" },
              { id: "ALTERNATE", title: "Alternate Days", description: "Every other day" },
              { id: "ONEOFF", title: "One-time Only", description: "No repeat" },
            ],
          },
        ],
      },
    },
  });
}

async function addressMenu(to) {
  sessions[to].step = "ADDRESS";
  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          "Delivery Address\n\n" +
          "📍 Fastest: Share your *live/current location* now\n" +
          "(Tap paperclip → Location → Share current location)",
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: "TYPE_ADDRESS", title: "✍ Type Address" } },
        ],
      },
    },
  });
  await sendText(
    to,
    "You can share location now or later. If typing, please send full address."
  );
}

async function timeMenu(to) {
  sessions[to].step = "TIME";
  await send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Preferred delivery time" },
      action: {
        button: "Time Slot",
        sections: [
          {
            title: "Slots",
            rows: [
              { id: "Morning", title: "🌅 Morning (6–9 AM)" },
              { id: "Evening", title: "🌆 Evening (5–8 PM)" },
            ],
          },
        ],
      },
    },
  });
}

async function summary(to) {
  const s = sessions[to];
  s.step = "CONFIRM";

  const subText = s.subscription === "DAILY" ? "Daily" :
                  s.subscription === "ALTERNATE" ? "Alternate days" : "One-time";

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
          `Price: ₹${s.price}\n` +
          `Subscription: ${subText}\n` +
          `Address: ${s.address || "To be shared"}\n` +
          `Time: ${s.time}`,
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
    const body = req.body;
    if (!body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      return res.sendStatus(200);
    }

    const msg = body.entry[0].changes[0].value.messages[0];
    const from = msg.from;

    // Ignore non-text/interactive for simplicity
    if (!msg.type) return res.sendStatus(200);

    // Auto-start if no session
    if (!sessions[from]) {
      await mainMenu(from);
      return res.sendStatus(200);
    }

    const s = sessions[from];
    const replyId =
      msg.interactive?.list_reply?.id ||
      msg.interactive?.button_reply?.id;

    // Location message
    if (msg.type === "location") {
      const loc = msg.location;
      s.address = `Lat: ${loc.latitude}, Lng: ${loc.longitude}` +
                  (loc.name ? ` - ${loc.name}` : "");
      await timeMenu(from);
      return res.sendStatus(200);
    }

    // Text fallback / manage replies
    if (msg.type === "text") {
      const text = msg.text.body.trim().toLowerCase();

      if (text.includes("menu") || text === "hi" || text === "hello") {
        await mainMenu(from);
        return res.sendStatus(200);
      }

      if (s.step === "ADDRESS" || s.step === "ADDRESS_TEXT") {
        s.address = msg.text.body;
        return timeMenu(from);
      }

      // Unknown text → fallback
      await sendText(
        from,
        "Sorry, I didn't understand 😅\n\n" +
        "Reply *menu* to start over\n" +
        `Or contact vendor: wa.me/${VENDOR_PHONE}`
      );
      return res.sendStatus(200);
    }

    if (!replyId) return res.sendStatus(200);

    // ────────────────────────────────────────────────
    // Main flow
    // ────────────────────────────────────────────────

    if (replyId === "NEW_ORDER" || replyId === "MENU") {
      return productMenu(from);
    }

    if (s.step === "PRODUCT") {
      return quantityMenu(from, replyId);
    }

    if (s.step === "QTY") {
      const [qty, price] = replyId.split("|");
      s.quantity = qty;
      s.price = price;
      return subscriptionMenu(from);
    }

    if (s.step === "SUBSCRIPTION") {
      s.subscription = replyId;
      return addressMenu(from);
    }

    if (s.step === "ADDRESS" && replyId === "TYPE_ADDRESS") {
      s.step = "ADDRESS_TEXT";
      await sendText(from, "Please type your full delivery address:");
      return res.sendStatus(200);
    }

    if (s.step === "TIME") {
      s.time = replyId;
      return summary(from);
    }

    if (s.step === "CONFIRM") {
      if (replyId === "CONFIRM") {
        const orderId = "ORD" + Date.now().toString().slice(-8);

        // Save to Google Sheet
        await axios.post(SHEET_URL, {
          orderId,
          phone: from,
          date: new Date().toISOString().split("T")[0],
          product: s.product,
          quantity: s.quantity,
          price: s.price,
          subscription: s.subscription || "ONEOFF",
          address: s.address || "Not provided",
          deliveryTime: s.time,
          status: "NEW",
        });

        const upiLink = `upi://pay?pa=yourvendor@upi&pn=BalaMilk&am=${s.price}&cu=INR&tn=${orderId}`;

        await sendText(
          from,
          `🎉 Thank you for ordering!\n\n` +
          `Order ID: ${orderId}\n` +
          `Pay ₹${s.price} here:\n${upiLink}\n\n` +
          `(Opens GPay/PhonePe/BHIM)`
        );

        delete sessions[from]; // clear session
      } else if (replyId === "CANCEL") {
        await sendText(from, "Order cancelled. Start again with *menu*");
        delete sessions[from];
      }
      return res.sendStatus(200);
    }

    // Manage orders (basic version)
    if (replyId === "MANAGE") {
      await sendText(
        from,
        "Manage Orders (coming soon)\n\n" +
        "For now, reply with:\n" +
        "• Cancel last order\n" +
        "• Pause for 3 days\n" +
        "• Change to 1L\n\n" +
        `Or contact vendor directly: wa.me/${VENDOR_PHONE}`
      );
      return res.sendStatus(200);
    }

    // Unknown interactive → fallback
    await sendText(from, "Invalid option. Reply *menu* to begin.");
    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

/* ================= SIMPLE VENDOR DASHBOARD ================= */
app.get("/dashboard", async (req, res) => {
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    const today = new Date().toISOString().split("T")[0];
    const todaysOrders = rows.filter((r) => r.get("date") === today);

    let html = `
      <h1>Bala Milk - Today's Orders (${todaysOrders.length})</h1>
      <table border="1" cellpadding="8">
        <tr>
          <th>Time</th><th>Phone</th><th>Product</th><th>Qty</th><th>Price</th><th>Sub</th><th>Address</th><th>Slot</th>
        </tr>
    `;

    todaysOrders.forEach((row) => {
      html += `
        <tr>
          <td>${row._rowNumber}</td>
          <td>${row.get("phone")}</td>
          <td>${row.get("product")}</td>
          <td>${row.get("quantity")}</td>
          <td>₹${row.get("price")}</td>
          <td>${row.get("subscription")}</td>
          <td>${row.get("address")}</td>
          <td>${row.get("deliveryTime")}</td>
        </tr>
      `;
    });

    html += "</table>";
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading dashboard");
  }
});

/* ================= VERIFY WEBHOOK ================= */
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
