/* Shoonya AI assistant: the same small local chat as the main site.
   It matches your words against the tags in /knowledge.json, so nothing you type leaves the page. */
(function () {
  var avatar = document.getElementById('pro-agent-avatar');
  var bubble = document.getElementById('pro-speech-bubble');
  var chatHistory = document.getElementById('pro-chat-history');
  var userInput = document.getElementById('pro-user-input');
  var sendBtn = document.getElementById('pro-send-btn');
  if (!avatar || !bubble) return;

  var knowledgeBase = [];

  avatar.addEventListener('click', function () {
    if (bubble.style.display === 'none' || bubble.style.display === '') {
      bubble.style.display = 'flex';
      if (knowledgeBase.length === 0) {
        fetch('/knowledge.json')
          .then(function (res) { return res.json(); })
          .then(function (data) { knowledgeBase = data; })
          .catch(function (err) { console.error('Failed to load knowledge', err); });
      }
    } else {
      bubble.style.display = 'none';
    }
  });

  function appendMessage(text, sender) {
    var p = document.createElement('p');
    p.className = sender === 'user' ? 'user-msg' : 'bot-msg';
    p.innerText = text;
    chatHistory.appendChild(p);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  function handleChat() {
    var text = userInput.value.trim().toLowerCase();
    if (!text) return;

    appendMessage(userInput.value, 'user');
    userInput.value = '';

    var thinkingId = 'thinking-' + Date.now();
    var p = document.createElement('p');
    p.className = 'bot-msg';
    p.id = thinkingId;
    p.innerText = 'Processing...';
    chatHistory.appendChild(p);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    setTimeout(function () {
      var el = document.getElementById(thinkingId);
      if (el) el.remove();

      var finalReply = 'I am a local knowledge assistant. Try asking about our ventures like Vapus, rta, or Raptor.';
      var bestMatchCount = 0;

      knowledgeBase.forEach(function (record) {
        var matchCount = 0;
        record.tags.forEach(function (tag) {
          if (text.indexOf(tag) !== -1) matchCount++;
        });
        if (matchCount > bestMatchCount) {
          bestMatchCount = matchCount;
          finalReply = record.response;
        }
      });

      appendMessage(finalReply, 'bot');
    }, 500);
  }

  sendBtn.addEventListener('click', handleChat);
  userInput.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') handleChat();
  });
})();
