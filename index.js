import express from "express";
import axios from "axios";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const sessions = {};

/* ================= VERIFY ================= */
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

/* ================= RECEIVE ================= */
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const replyId =
      msg.interactive?.list_reply?.id ||
      msg.interactive?.button_reply?.id;

    if (!sessions[from]) {
      sessions[from] = { step: "MENU" };
      await sendMenu(from);
      return res.sendStatus(200);
    }

    const s = sessions[from];

    /* ===== BACK ===== */
    if (replyId === "BACK") {
      s.step = "MENU";
      await sendMenu(from);
      return res.sendStatus(200);
    }

    /* ===== LOCATION ===== */
    if (msg.location && s.step === "LOCATION") {
      s.location = msg.location;
      s.step = "DELIVERY_SLOT";
      await sendDeliverySlot(from);
      return res.sendStatus(200);
    }

    switch (s.step) {
      case "MENU":
        selectProduct(replyId, s);
        if (!s.product) return sendMenu(from);
        s.step = "QTY";
        await sendQuantity(from, s);
        break;

      case "QTY":
        selectQuantity(replyId, s);
        if (!s.qty) return sendQuantity(from, s);
        s.step = "ADDRESS";
        await sendText(from, "🏠 Please type your delivery address");
        break;

      case "ADDRESS":
        s.address = msg.text?.body;
        if (!s.address) return sendText(from, "❌ Please type address");
        s.step = "LOCATION";
        await sendText(from, "📍 Please share your live location");
        break;

      case "DELIVERY_SLOT":
        s.slot = replyId;
        if (!s.slot) return sendDeliverySlot(from);
        s.step = "TIME";
        await sendText(from, `⏰ Enter delivery time for *${s.slot}*`);
        break;

      case "TIME":
        s.time = msg.text?.body;
        if (!s.time) return sendText(from, "❌ Enter valid time");
        s.step = "CONFIRM";
        await sendConfirm(from, s);
        break;

      case "CONFIRM":
        if (replyId === "CONFIRM") {
          await sendText(from, "✅ Order confirmed 🥛\nThank you!");
          delete sessions[from];
        }
        break;
    }

    res.sendStatus(200);
  } catch (e) {
    console.error(e.response?.data || e);
    res.sendStatus(200);
  }
});

/* ================= LOGIC ================= */
function selectProduct(id, s) {
  const p = {
    BUFFALO: [100, "Buffalo Milk"],
    COW: [120, "Cow Milk"],
    PANEER: [600, "Paneer"],
    GHEE: [1000, "Ghee"],
    SUB: [0, "Daily Subscription"],
    OWNER: [0, "Talk to Owner"]
  };
  if (p[id]) {
    s.price = p[id][0];
    s.product = p[id][1];
  }
}

function selectQuantity(id, s) {
  const q = {
    Q500: ["500 ml", s.price * 0.5],
    Q1: ["1 L", s.price],
    Q2: ["2 L", s.price * 2]
  };
  if (q[id]) {
    s.qty = q[id][0];
    s.total = q[id][1];
  }
}

/* ================= SENDERS ================= */
async function sendMenu(to) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "🥛 *Bala Milk Store*\nSelect product" },
        action: {
          button: "Menu",
          sections: [
            {
              title: "Products",
              rows: [
                { id: "BUFFALO", title: "Buffalo Milk – ₹100/L" },
                { id: "COW", title: "Cow Milk – ₹120/L" },
                { id: "PANEER", title: "Paneer – ₹600/Kg" },
                { id: "GHEE", title: "Ghee – ₹1000/Kg" },
                { id: "SUB", title: "Daily Subscription" },
                { id: "OWNER", title: "Talk to Owner" }
              ]
            }
          ]
        }
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

async function sendQuantity(to, s) {
  await sendButtons(
    to,
    `🛒 ${s.product}\nChoose quantity`,
    [
      { id: "Q500", title: "500 ml" },
      { id: "Q1", title: "1 L" },
      { id: "Q2", title: "2 L" },
      { id: "BACK", title: "⬅ Back" }
    ]
  );
}

async function sendDeliverySlot(to) {
  await sendButtons(
    to,
    "⏰ Select delivery slot",
    [
      { id: "Morning", title: "Morning" },
      { id: "Evening", title: "Evening" },
      { id: "BACK", title: "⬅ Back" }
    ]
  );
}

async function sendConfirm(to, s) {
  await sendButtons(
    to,
    `🧾 *Confirm Order*\n
Product: ${s.product}
Qty: ${s.qty}
Amount: ₹${s.total}
Slot: ${s.slot}
Time: ${s.time}
Address: ${s.address}`,
    [
      { id: "CONFIRM", title: "Confirm ✅" },
      { id: "BACK", title: "⬅ Back" }
    ]
  );
}

async function sendButtons(to, body, buttons) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title }
          }))
        }
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

async function sendText(to, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

/* ================= START ================= */
app.listen(10000, () => console.log("Server running"));
