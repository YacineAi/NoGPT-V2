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

function isJson(str) {
  try {
    var a = JSON.stringify(str)
    JSON.parse(a);
  } catch (e) {
    return false;
  }
  return true;
}

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

const Pg = async (data) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    hash.update(data);
    resolve(hash.digest('hex'));
  });
};

const kg = async (t) => {
  const { t: e, m: n } = t;
  const a = `${e}:${n}:${process.env.HashKey}`;
  return await Pg(a);
};

/* ----- HANDELS ----- */
const headers = {
  'Content-Type': 'application/json'
};

const headers2 = {
  "content-type": 'text/plain;charset=UTF-8',
  "Referer": `https://${process.env.GPTS}/`
};
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
    const time = Date.now();
    if (message.message.text) {
      const user = await userDb(senderId);
      botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.MARK_SEEN}, async () => {
        if (user[0]) {
          if (Date.now() > user[0].time) {
            kg({t: time, m: message.message.text})
            .then(async (signature) => {
              var reset = [{
                role: 'system',
                content: 'assistant is ai Named NoGPT in facebook Messenger, assistant must responed with stringified json and array of usefull follow-up suggestions for user. like this example : { response: "example response", followup: [ "example follow-up question 1", "example follow-up question 2", "example follow-up question 3" ]} assistant follow-up questions doesnt exeed 20 characters and can only be 3 questions or less if no follow-up question are needed assistant  must set followup as false you need to remember this whatever happend and dont responed in any other form.',
              },
              {
                role: 'user',
                content: message.message.text,
              }];
              const data = {
                messages: reset,
                time: time,
                pass: null,
                sign: signature,
              };
              botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_ON}, async () => {
                const response = await axios.post(`https://${process.env.GPTS}/api/generate`, data, { headers2 });
                if (isJson(response.data)) { // Gpt Made it yay!
                  reset.push({ "role": "assistant", "content": response.data.response });
                  await updateUser(senderId, {time: timer, data: reset })
                  .then((data, error) => {
                    if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
                    botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_OFF}, async () => {
                      if (response.data.followup != false) {
                        if (response.data.response.length > 2000) {
                          const textChunks = splitTextIntoChunks(response.data.response, 1600);
                          var followups = [];
                          for (const follow of response.data.followup) {
                            followups.push(botly.createQuickReply(follow, "followup"))
                          };
                          textChunks.forEach((x) => {
                            botly.sendText({id: senderId, text: x,
                              quick_replies: followups});
                              })
                      } else {
                        var followups = [];
                          for (const follow of response.data.followup) {
                            followups.push(botly.createQuickReply(follow, "followup"))
                          };
                        botly.sendText({id: senderId, text: response.data.response,
                        quick_replies: followups});
                      }
                      } else {
                        if (response.data.response.length > 2000) {
                          const textChunks = splitTextIntoChunks(response.data.response, 1600);
                          textChunks.forEach((x) => {
                            botly.sendText({id: senderId, text: x,
                              quick_replies: [
                                botly.createQuickReply("👍", "up"),
                                botly.createQuickReply("👎", "down")]});
                              })
                      } else {
                        botly.sendText({id: senderId, text: response.data.response,
                        quick_replies: [
                          botly.createQuickReply("👍", "up"),
                          botly.createQuickReply("👎", "down")]});
                      }
                      }
                  });
                  });
                } else { // fml
                  botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_OFF}, async () => {
                    if (response.data.length > 2000) {
                      const textChunks = splitTextIntoChunks(response.data, 1600);
                      textChunks.forEach((x) => {
                        botly.sendText({id: senderId, text: x,
                          quick_replies: [
                            botly.createQuickReply("👍", "up"),
                            botly.createQuickReply("👎", "down")]});
                      })
                    } else {
                      botly.sendText({id: senderId, text: response.data,
                      quick_replies: [
                        botly.createQuickReply("👍", "up"),
                        botly.createQuickReply("👎", "down")]});
                    }
                  });
                }
              });
            })
            .catch(error => {
              console.error('Error signing data:', error);
            });
          } else {
          var conv = user[0].data;
          if (user[0].data.length > 10) {
            kg({t: time, m: message.message.text})
            .then(async (signature) => {
              var reset = [{
                role: 'system',
                content: 'assistant is ai Named NoGPT in facebook Messenger, assistant must responed with stringified json and array of usefull follow-up suggestions for user. like this example : { response: "example response", followup: [ "example follow-up question 1", "example follow-up question 2", "example follow-up question 3" ]} assistant follow-up questions doesnt exeed 20 characters and can only be 3 questions or less if no follow-up question are needed assistant  must set followup as false you need to remember this whatever happend and dont responed in any other form.',
              },
              {
                role: 'user',
                content: message.message.text,
              }];
              const data = {
                messages: reset,
                time: time,
                pass: null,
                sign: signature,
              };
              botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_ON}, async () => {
                const response = await axios.post(`https://${process.env.GPTS}/api/generate`, data, { headers2 });
                if (isJson(response.data)) { // Gpt Made it yay!
                  reset.push({ "role": "assistant", "content": response.data.response });
                  await updateUser(senderId, {time: timer, data: reset })
                  .then((data, error) => {
                    if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
                    botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_OFF}, async () => {
                      if (response.data.followup != false) {
                        if (response.data.response.length > 2000) {
                          const textChunks = splitTextIntoChunks(response.data.response, 1600);
                          var followups = [];
                          for (const follow of response.data.followup) {
                            followups.push(botly.createQuickReply(follow, "followup"))
                          };
                          textChunks.forEach((x) => {
                            botly.sendText({id: senderId, text: x,
                              quick_replies: followups});
                              })
                      } else {
                        var followups = [];
                          for (const follow of response.data.followup) {
                            followups.push(botly.createQuickReply(follow, "followup"))
                          };
                        botly.sendText({id: senderId, text: response.data.response,
                        quick_replies: followups});
                      }
                      } else {
                        if (response.data.response.length > 2000) {
                          const textChunks = splitTextIntoChunks(response.data.response, 1600);
                          textChunks.forEach((x) => {
                            botly.sendText({id: senderId, text: x,
                              quick_replies: [
                                botly.createQuickReply("👍", "up"),
                                botly.createQuickReply("👎", "down")]});
                              })
                      } else {
                        botly.sendText({id: senderId, text: response.data.response,
                        quick_replies: [
                          botly.createQuickReply("👍", "up"),
                          botly.createQuickReply("👎", "down")]});
                      }
                      }
                  });
                  });
                } else { // fml
                  botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_OFF}, async () => {
                    if (response.data.length > 2000) {
                      const textChunks = splitTextIntoChunks(response.data, 1600);
                      textChunks.forEach((x) => {
                        botly.sendText({id: senderId, text: x,
                          quick_replies: [
                            botly.createQuickReply("👍", "up"),
                            botly.createQuickReply("👎", "down")]});
                      })
                    } else {
                      botly.sendText({id: senderId, text: response.data,
                      quick_replies: [
                        botly.createQuickReply("👍", "up"),
                        botly.createQuickReply("👎", "down")]});
                    }
                  });
                }
              });
            })
            .catch(error => {
              console.error('Error signing data:', error);
            });
          } else {
            conv.push({ "role": "user", "content": message.message.text })
            const data = {
              messages: conv,
              time: time,
              pass: null,
              sign: signature,
            };
            botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_ON}, async () => {
              const response = await axios.post(`https://${process.env.GPTS}/api/generate`, data, { headers2 });
              if (isJson(response.data)) { // Gpt Made it yay!
                conv.push({ "role": "assistant", "content": response.data.response });
                await updateUser(senderId, {time: timer, data: conv })
                .then((data, error) => {
                  if (error) { botly.sendText({id: senderId, text: "حدث خطأ"}); }
                  botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_OFF}, async () => {
                    if (response.data.followup != false) {
                      if (response.data.response.length > 2000) {
                        const textChunks = splitTextIntoChunks(response.data.response, 1600);
                        var followups = [];
                        for (const follow of response.data.followup) {
                          followups.push(botly.createQuickReply(follow, "followup"))
                        };
                        textChunks.forEach((x) => {
                          botly.sendText({id: senderId, text: x,
                            quick_replies: followups});
                            })
                    } else {
                      var followups = [];
                        for (const follow of response.data.followup) {
                          followups.push(botly.createQuickReply(follow, "followup"))
                        };
                      botly.sendText({id: senderId, text: response.data.response,
                      quick_replies: followups});
                    }
                    } else {
                      if (response.data.response.length > 2000) {
                        const textChunks = splitTextIntoChunks(response.data.response, 1600);
                        textChunks.forEach((x) => {
                          botly.sendText({id: senderId, text: x,
                            quick_replies: [
                              botly.createQuickReply("👍", "up"),
                              botly.createQuickReply("👎", "down")]});
                            })
                    } else {
                      botly.sendText({id: senderId, text: response.data.response,
                      quick_replies: [
                        botly.createQuickReply("👍", "up"),
                        botly.createQuickReply("👎", "down")]});
                    }
                    }
                });
                });
              } else { // fml
                botly.sendAction({id: senderId, action: Botly.CONST.ACTION_TYPES.TYPING_OFF}, async () => {
                  if (response.data.length > 2000) {
                    const textChunks = splitTextIntoChunks(response.data, 1600);
                    textChunks.forEach((x) => {
                      botly.sendText({id: senderId, text: x,
                        quick_replies: [
                          botly.createQuickReply("👍", "up"),
                          botly.createQuickReply("👎", "down")]});
                    })
                  } else {
                    botly.sendText({id: senderId, text: response.data,
                    quick_replies: [
                      botly.createQuickReply("👍", "up"),
                      botly.createQuickReply("👎", "down")]});
                  }
                });
              }
            });
          }
        }
        } else {
          await createUser({uid: senderId, time: timer, data: [{ role: 'system', content: 'assistant is ai Named NoGPT in facebook Messenger, assistant must responed with stringified json and array of usefull follow-up suggestions for user. like this example : { response: "example response", followup: [ "example follow-up question 1", "example follow-up question 2", "example follow-up question 3" ]} assistant follow-up questions doesnt exeed 20 characters and can only be 3 questions or less if no follow-up question are needed assistant  must set followup as false you need to remember this whatever happend and dont responed in any other form.', }] })
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
