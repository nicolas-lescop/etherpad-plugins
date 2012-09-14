var _, $, jQuery;

var $ = require('ep_etherpad-lite/static/js/rjquery').$;
var _ = require('ep_etherpad-lite/static/js/underscore');
var cssFiles = ['ep_comments/static/css/comment.css'];

/************************************************************************/
/*                         ep_comments Plugin                           */
/************************************************************************/

function epComments(context){
  this.container = null;
  this.padOuter = null;
  this.sideDiv = null;
  this.padInner = null;
  this.ace = context.ace;
  this.socket = io.connect('/comment');
  this.padId = clientVars.padId;
  this.comments = [];

  this.const = {
    COMMENT_BORDER: 20
  };

  this.init();
}

// Init Etherpad plugin comment pads
epComments.prototype.init = function(){
  var self = this;
  var ace = this.ace;

  // Init prerequisite
  this.findContainers();
  this.insertContainer();
  this.hideLineNumbers();

  // Get all comments
  this.getComments(function (comments){
    if (!$.isEmptyObject(comments)){
      self.setComments(comments);
      self.collectComments();
    }
  });

  // Init add push event
  this.pushComment('add', function (commentId, comment){
    self.setComment(commentId, comment);
    console.log('pushComment',comment);
    self.collectComments();
  });

  // On click toolbar comment icon
  $('#addComment').on('click', function(){
    // Add a comment and link it to the selection
    self.addComment();
  });
};

// Insert comments container on sideDiv element use for linenumbers 
epComments.prototype.findContainers = function(){
  var padOuter = $('iframe[name="ace_outer"]').contents();

  this.padOuter = padOuter;
  this.sideDiv  = padOuter.find('#sidediv');
  this.padInner = padOuter.find('iframe[name="ace_inner"]');
};

// Hide linenumbers
epComments.prototype.hideLineNumbers = function(){
  this.sideDiv.find('table').hide();
};

// Collect Comments and link text content to the sidediv
epComments.prototype.collectComments = function(callback){
  var self = this;
  var container = this.container;
  var comments = this.comments;
  var padComment = this.padInner.contents().find('.comment');

  padComment.each(function(it){
    var $this = $(this);
    var cls = $this.attr('class');
    var classCommentId = /(?:^| )(c-[A-Za-z0-9]*)/.exec(cls);
    var commentId = (classCommentId) ? classCommentId[1] : null;

    if (commentId === null) {
      var isAuthorClassName = /(?:^| )(a.[A-Za-z0-9]*)/.exec(cls);
      if (isAuthorClassName && callback) callback(isAuthorClassName[1], it);
      return;
    }

    var commentId = classCommentId[1];
    var commentElm = container.find('#'+ commentId);
    var comment = comments[commentId];

    if (comment !== null) {
      // If comment is not in sidebar insert it
      if (commentElm.length == 0) {
        self.insertComment(commentId, comment.data, it);
        commentElm = container.find('#'+ commentId);

        $this.mouseenter(function(){
          commentElm.css('color', 'red');
        }).mouseleave(function(){
          commentElm.css('color', '');
        });
      }
    }
    
    var prevCommentElm = commentElm.prev();
    var commentPos;

    if (prevCommentElm.length == 0) {
      commentPos = 0;
    } else {
      var prevCommentPos = prevCommentElm.css('top');
      var prevCommentHeight = prevCommentElm.innerHeight();
      
      commentPos = parseInt(prevCommentPos) + prevCommentHeight + 30;
    }
    
    commentElm.css({ 'top': commentPos });
    
  });
};

// 
epComments.prototype.insertContainer = function(){
  var sideDiv = this.sideDiv;

  // Add comments 
  sideDiv.prepend('<div id="comments"></div>');

  this.container = sideDiv.find('#comments');
};

// Insert new Comment Form
epComments.prototype.insertNewComment = function(comment, callback){
  var index = 0;
  this.insertComment("", comment, index, true);

  this.container.find('#newComment .submit').on('click', function(){
    var form = $(this).parent();
    var text = form.find('.text').val();

    form.remove();

    callback(text, index);
  });
};

// Insert a comment node 
epComments.prototype.insertComment = function(commentId, comment, index, isNew){
  comment.commentId = commentId;
  var template = (isNew === true) ? 'newCommentTemplate' : 'commentsTemplate';
  var content = $('#'+ template).tmpl(comment);
  var container = this.container;
  var commentAfterIndex = container.eq(index+1);
  
  if (index == 0) content.prependTo(container);
  else if (commentAfterIndex.length == 0) content.appendTo(container);
  else commentAfterIndex.after(content);
};

// Set comments content data
epComments.prototype.setComments = function(comments){
  for(var commentId in comments){
    this.setComment(commentId, comments[commentId]);
  }
};

// Set comment data
epComments.prototype.setComment = function(commentId, comment){
  var comments = this.comments;
  if (comments[commentId] == null) comments[commentId] = {};
  comments[commentId].data = comment;
};

// Get all comments
epComments.prototype.getComments = function (callback){
  var req = { padId: this.padId };

  this.socket.emit('getComments', req, function (res){
    callback(res.comments);
  });
};

epComments.prototype.getCommentData = function (){
  var data = {};
  data.padId = this.padId;
  data.comment = {};
  data.comment.author = clientVars.userId;
  data.comment.name = clientVars.userName;
  data.comment.timestamp = 123456789;
  
  // Si le client est Anonyme
  if(data.comment.name === undefined){
    data.comment.name = clientVars.userAgent;
  }

  return data;
}

// Add a pad comment 
epComments.prototype.addComment = function (callback){
  var socket = this.socket;
  var data = this.getCommentData();
  var ace = this.ace;
  var self = this;
  var rep = {};
  //var selectionRange = this.saveSelection();

  ace.callWithAce(function (ace){
    var saveRep = ace.ace_getRep();
    rep.selStart = saveRep.selStart;
    rep.selEnd = saveRep.selEnd;
    rep.selFocusAtStart = saveRep.selFocusAtStart;

    ace.ace_doInsertComment(data.comment.author);
  },'insertNewComment', true);
  
  console.log('saveRep', rep);
  
  this.insertNewComment(data, function (text, index){
    data.comment.text = text;

    // Save comment
    socket.emit('addComment', data, function (commentId, comment){
      comment.commentId = commentId;
      self.insertComment(commentId, comment, index);
      //callback(commentId);
      ace.callWithAce(function (ace){
        ace.ace_doInsertComment(commentId, rep);
      },'insertComment', true);
    });
  });
};

// Push comment from collaborators
epComments.prototype.pushComment = function(eventType, callback){
  var socket = this.socket;

  // On collaborator add a comment in the current pad
  if (eventType == 'add'){
    socket.on('pushAddComment', function (commentId, comment){
      callback(commentId, comment);
    });
  }

  // On collaborator delete a comment in the current pad
  else if (eventType == 'remove'){
    socket.on('pushRemoveComment', function (commentId){
      callback(commentId);
    });
  }

};

/************************************************************************/
/*                           Etherpad Hooks                             */
/************************************************************************/

// Init pad comments 
var postAceInit = function padCommentsInit(hook, context){
  var Comments = new epComments(context);
};

// Insert comments classes
function aceAttribsToClasses(hook, context){
  if(context.key == 'comment'){
    var cls = context.value;
    var isAuthorClassName = /(?:^| )(a.[A-Za-z0-9]*)/.exec(cls);
    
    if(isAuthorClassName){
      return (context.value == clientVars.userId) ? ['comment', context.value] : [];
    }
    
    return ['comment', context.value];
  }
}

function aceEditEvent(hook, context){
  var callstack = context.callstack;
  
  if(callstack.editEvent.eventType == 'handleKeyEvent'){
    //console.log(callstack.editEvent);
  }
}

// Associate comment to a selection
function doInsertComment(commentId, rep){
  var editorInfo = this.editorInfo;

  if(rep) editorInfo.ace_performSelectionChange(rep.selStart,rep.selEnd,rep.selFocusAtStart);

  editorInfo.ace_setAttributeOnSelection('comment', commentId);
}

// Once ace is initialized, we set ace_doInsertFormat and bind it to the context
function aceInitialized(hook, context){
  var editorInfo = context.editorInfo;
  editorInfo.ace_doInsertComment = _(doInsertComment).bind(context);
}

function aceEditorCSS(){
  return cssFiles;
}

exports.aceEditorCSS = aceEditorCSS;
exports.postAceInit = postAceInit;
exports.aceAttribsToClasses = aceAttribsToClasses;
exports.aceInitialized = aceInitialized;
exports.aceEditEvent = aceEditEvent;