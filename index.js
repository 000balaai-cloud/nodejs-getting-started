import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const PORT = process.env.PORT || 10000;

/* ---------------- HEALTH CHECK ---------------- */
app.get("/", (req, res) => {
  res.send("WhatsApp Bot is Running ✅");
});

/* ---------------- WEBHOOK VERIFY ---------------- */
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "mytoken123";

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/* ---------------- WEBHOOK RECEIVE ---------------- */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages) {
      return res.sendStatus(200);
    }

    const message = value.messages[0];
    const from = message.from;

    console.log("📩 Incoming:", JSON.stringify(message, null, 2));

    // TEXT MESSAGE
    if (message.type === "text") {
      const text = message.text.body.toLowerCase();

      if (text === "hi" || text === "hello") {
        await sendMainMenu(from);
      } else {
        await sendText(from, "Please use menu buttons ⬇️");
      }
    }

    // BUTTON REPLY
    if (message.type === "interactive") {
      const id = message.interactive.button_reply.id;
      await handleButton(from, id);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook Error:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

/* ---------------- BUTTON HANDLER ---------------- */
async function handleButton(to, id) {
  switch (id) {
    case "BUFFALO":
      await sendText(to, "🐃 Buffalo Milk\n₹100 / L");
      break;

    case "COW":
      await sendText(to, "🐄 Cow Milk\n₹120 / L");
      break;

    case "PANEER":
      await sendText(to, "🧀 Paneer\n₹600 / Kg");
      break;

    case "GHEE":
      await sendText(to, "🧈 Ghee\n₹1000 / Kg");
      break;

    case "SUBSCRIPTION":
      await sendText(to, "📆 Daily Milk Subscription\nOwner will contact you");
      break;

    case "OWNER":
      await sendText(to, "📞 Owner Contact: +91XXXXXXXXXX");
      break;

    default:
      await sendText(to, "Please choose from menu ⬇️");
  }
}

/* ---------------- MAIN MENU ---------------- */
async function sendMainMenu(to) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "🥛 *Welcome to Bala Milk Store*\n\nPlease choose an option:"
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "BUFFALO", title: "🐃 Buffalo Milk" } },
            { type: "reply", reply: { id: "COW", title: "🐄 Cow Milk" } },
            { type: "reply", reply: { id: "PANEER", title: "🧀 Paneer" } }
          ]
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );

  // second row (WhatsApp allows only 3 buttons per message)
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "More options ⬇️" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "GHEE", title: "🧈 Ghee" } },
            { type: "reply", reply: { id: "SUBSCRIPTION", title: "📆 Subscription" } },
            { type: "reply", reply: { id: "OWNER", title: "📞 Talk to Owner" } }
          ]
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

/* ---------------- TEXT MESSAGE ---------------- */
async function sendText(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

/* ---------------- START SERVER ---------------- */
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
