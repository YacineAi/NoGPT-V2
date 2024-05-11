const express = require("express");
const app = express();
const crypto = require('crypto');
const Botly = require("botly");
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false} });
const botly = new Botly({
	accessToken: process.env.PAGE_ACCESS_TOKEN,
	notificationType: Botly.CONST.REGULAR,
	FB_URL: "https://graph.facebook.com/v2.6/",
});

app.get("/", function(_req, res) {
	res.sendStatus(200);
});
/* ----- ESSENTIALS ----- */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
/* ----- MAGIC ----- */
app.post('/webhook', (req, res) => {
 // console.log(req.body)
  if (req.body.message) {
    onMessage(req.body.message.sender.id, req.body.message);
  } else if (req.body.postback) {
    onPostBack(req.body.postback.message.sender.id, req.body.postback.message, req.body.postback.postback);
  }
  res.sendStatus(200);
});
/* ----- DB Qrs ----- */

async function createUser(user) {
    const { data, error } = await supabase
        .from('users')
        .insert([ user ]);
  
      if (error) {
        throw new Error('Error creating user : ', error);
      } else {
        return data
      }
  };
  
  async function updateUser(id, update) {
    const { data, error } = await supabase
      .from('users')
      .update( update )
      .eq('uid', id);
  
      if (error) {
        throw new Error('Error updating user : ', error);
      } else {
        return data
      }
  };
  
  async function userDb(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('uid', userId);
  
    if (error) {
      console.error('Error checking user:', error);
    } else {
      return data
    }
  };


function splitTextIntoChunks(text, chunkSize) {
  const words = text.split(' ');
  const chunks = [];
  let currentChunk = '';
  for (const word of words) {
    if (currentChunk.length + word.length + 1 <= chunkSize) { // +1 for the space
      if (currentChunk) {
        currentChunk += ' ';
      }
      currentChunk += word;
    } else {
      chunks.push(currentChunk);
      currentChunk = word;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks;
};

/* ----- HANDELS ----- */

const onMessage = async (senderId, message) => {
  /*
  botly.sendButtons(
    {
      id: senderId,
      text: "نو جيبيتي متوقف للصيانة. نقدر صبركم ♥",
      buttons: [botly.createWebURLButton("NOTI 💻", "facebook.com/0xNoti/")],
    })
    */
    const timer = new Date().getTime() + 1 * 60 * 60 * 1000;
    //const time = Date.now();
    if (message.message.text) {
      const user = await userDb(senderId);
      botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.MARK_SEEN}, async () => {
        if (user[0]) {
          if (Date.now() > user[0].time) {
            var reset = [];
            const data = {"model": "gpt-3.5-turbo","messages": [{ "role": "user", "content": message.message.text }],"max_tokens": 2048};
            
            botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_ON}, async () => {
              try {
                const response = await axios.post(`https://${process.env.HIDDEN}/openai/deployments/gpt-35-turbo/chat/completions?api-version=2024-03-01-preview`, data, { headers : {
                'Accept-Encoding': 'gzip',
                'api-key': process.env.HTOKEN,
                'Connection': 'Keep-Alive',
                'Content-Length': data.length,
                'Content-Type': 'application/json',
                'Host': process.env.HIDDEN,
                'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9; ASUS_I003DD Build/PI)'
              }});
              reset.push({ "role": "user", "content": message.message.text }, { "role": "assistant", "content": response.data.choices[0].message.content });
              await updateUser(senderId, {time: timer, data: reset })
              .then((data, error) => {
                if (error) {
                    botly.sendText({id: senderId, text: "حدث خطأ"});
                }
                botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_OFF}, async () => {
                  botly.sendText({id: senderId, text: response.data.choices[0].message.content + "\n\n\n- - - ------( 📣💬💻 )------ - - -\nلضمان متابعة تقديم الخدمة يرجى دعمنا بمتابعة حساب صاحب الصفحة :\nhttps://facebook.com/0xNoti"});
                });
              });
              } catch (error) {
                if (error.response.status == 400 && error.response.data.error.code == "content_filter") {
                  botly.sendText({id: senderId, text: "يرجى الانتباه إلى أن رسالتك تتعارض مع سياسة OpenAI. نأمل أن تلتزم بشروط الاستخدام والسياسات المحددة لتجنب أي مخالفات مستقبلية."});
                } else {
                  botly.sendButtons({
                    id: senderId,
                    text: "حدث شيئ خاطئ!. إذا تابع الخطأ في الظهور راسل المطور",
                    buttons: [
                      botly.createWebURLButton("حساب المطور 💻👤", "facebook.com/0xNoti/"),
                    ],
                  });
                }
              }
            });
          } else {
          var conv = user[0].data;
          conv.push({ "role": "user", "content": message.message.text })
          const data = {"model": "gpt-3.5-turbo", "messages": conv,"max_tokens": 2048};
            botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_ON}, async () => {
              try {
                const response = await axios.post(`https://${process.env.HIDDEN}/openai/deployments/gpt-35-turbo/chat/completions?api-version=2024-03-01-preview`, data, { headers : {
                'Accept-Encoding': 'gzip',
                'api-key': process.env.HTOKEN,
                'Connection': 'Keep-Alive',
                'Content-Length': data.length,
                'Content-Type': 'application/json',
                'Host': process.env.HIDDEN,
                'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9; ASUS_I003DD Build/PI)'
              }});
              conv.push({ "role": "assistant", "content": response.data.choices[0].message.content });
              await updateUser(senderId, {time: timer, data: conv })
              .then((data, error) => {
                if (error) {
                    botly.sendText({id: senderId, text: "حدث خطأ"});
                }
                botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_OFF}, async () => {
                  botly.sendText({id: senderId, text: response.data.choices[0].message.content + "\n\n\n- - - ------( 📣💬💻 )------ - - -\nلضمان متابعة تقديم الخدمة يرجى دعمنا بمتابعة حساب صاحب الصفحة :\nhttps://facebook.com/0xNoti"});
                });
              });
              } catch (error) {
                if (error.response.status == 400 && error.response.data.error.code == "content_filter") {
                  botly.sendText({id: senderId, text: "يرجى الانتباه إلى أن رسالتك تتعارض مع سياسة OpenAI. نأمل أن تلتزم بشروط الاستخدام والسياسات المحددة لتجنب أي مخالفات مستقبلية."});
                } else if (error.response.status == 400 && error.response.data.error.code == "context_length_exceeded") {
                  botly.sendText({id: senderId, text: "يرجى ملاحظة أن النص المرسل يتجاوز الحد المسموح به من الأحرف. يرجى تقليل النص للامتثال الكامل مع القواعد المحددة. شكرًا لتفهمك وامتثالك."});
                } else {
                  botly.sendButtons({
                    id: senderId,
                    text: "حدث شيئ خاطئ!. إذا تابع الخطأ في الظهور راسل المطور",
                    buttons: [
                      botly.createWebURLButton("حساب المطور 💻👤", "facebook.com/0xNoti/"),
                    ],
                  });
                }
              }
            });
          }
        } else {
          await createUser({uid: senderId, time: timer, data: [] })
            .then((data, error) => {
              botly.sendButtons({
                id: senderId,
                text: "مرحبا 💬.\nأنا نوتي 🤗 روبوت ذكاء صناعي مدعم بـGPT 3.5 يمكنك سؤالي عن أي معلومات تحتاجها ✨\nاستطيع مساعدتك في كتابة النصوص و حل المشاكل البرمجية 🤓.\nيمكنك الان البدأ بإستعمالي ^-^",
                buttons: [
                  botly.createWebURLButton("حساب المطور 💻👤", "facebook.com/0xNoti/"),
                ],
              });
            });
        }
      });
      } else if (message.message.attachments[0].payload.sticker_id) {
        //botly.sendText({id: senderId, text: "(Y)"});
      } else if (message.message.attachments[0].type == "image") {
        botly.sendText({id: senderId, text: "المرجو إستعمال النصوص فقط"});
      } else if (message.message.attachments[0].type == "audio") {
        botly.sendText({id: senderId, text: "المرجو إستعمال النصوص فقط"});
      } else if (message.message.attachments[0].type == "video") {
        botly.sendText({id: senderId, text: "المرجو إستعمال النصوص فقط"});
      }
};
/* ----- POSTBACK ----- */

const onPostBack = async (senderId, message, postback) => {
  if (message.postback) {
    if (postback == "") {
      //
    } else if (postback == "") {
      //
    } else if (postback == "") {
      //
    } else if (postback == "") {
      //
    } else if (postback == "") {
      //
    } else if (postback == "") {
      //
    } else if (message.postback.title == "") {
      //
    } else if (message.postback.title == "") {
      //
    } else if (message.postback.title == "") {
      //
    } else if (message.postback.title == "") {
      //
    }
  } else {
    // Quick Reply
    if (message.message.text == "") {
      //
    } else if (message.message.text == "") {
      //
    } else if (postback == "up" || postback == "down") {
      botly.sendText({id: senderId, text: "شكرا لترك التقييم ♥"});
    } else if (postback == "followup") {
      botly.sendText({id: senderId, text: "جاري العمل عليها..."});
    }
  }
};
/* ----- HANDELS ----- */
app.listen(3000, () => console.log(`App is on port : 3000`));
