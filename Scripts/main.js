const erbFormatter = require("./erbFormatter");

exports.activate = async function () {
  if (nova.inDevMode()) {
    console.clear();
    console.log("ERB::Formatter extension activated");
  }

  const displayError = (message) => {
    console.error(message);
    const request = new NotificationRequest();
    request.title = "ERB::Formatter Error";
    request.body = message;
    nova.notifications
      .add(request)
      .catch((err) => console.error(err, err.stack));
  };

  const matchesPattern = (path, pattern) => {
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\/\*\*\/\*/g, "/.*")
      .replace(/\*\*\//g, "(?:.*/)?")
      .replace(/\/\*\*$/g, "/.*")
      .replace(/^\*\*$/g, ".*")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]");

    regexPattern = `^${regexPattern}$`;

    const regex = new RegExp(regexPattern);
    return regex.test(path);
  };

  const shouldExcludeFile = (filePath) => {
    const excludePatterns =
      nova.workspace.config.get(
        "gttmnn.erb-formatter.excludePatterns",
        "array",
      ) || [];

    if (!excludePatterns || excludePatterns.length === 0) {
      return false;
    }

    let cleanPath = filePath;
    if (filePath.startsWith("file://")) {
      cleanPath = decodeURIComponent(filePath.replace("file://", ""));
    }

    const workspacePath = nova.workspace.path;
    let relativePath = cleanPath;

    if (workspacePath && cleanPath.startsWith(workspacePath)) {
      relativePath = cleanPath.substring(workspacePath.length);
      if (relativePath.startsWith("/")) {
        relativePath = relativePath.substring(1);
      }
    }

    return excludePatterns.some((pattern) => {
      try {
        return matchesPattern(relativePath, pattern);
      } catch (error) {
        if (nova.inDevMode()) {
          console.error(`Invalid exclude pattern: ${pattern}`, error);
        }
        return false;
      }
    });
  };

  const replaceDocument = (editor, text) => {
    const documentSpan = new Range(0, editor.document.length);
    const documentText = editor.document.getTextInRange(documentSpan);

    if (documentText != text) {
      editor.edit((edit) => {
        edit.replace(documentSpan, text);
      });
    }
  };

  const formatDocument = (editor) => {
    if (shouldExcludeFile(editor.document.uri)) {
      if (nova.inDevMode()) {
        console.log(`Skipping excluded file: ${editor.document.uri}`);
      }
      return Promise.resolve();
    }

    const documentSpan = new Range(0, editor.document.length);
    const documentText = editor.document.getTextInRange(documentSpan);

    return erbFormatter(documentText)
      .then((formattedText) => replaceDocument(editor, formattedText))
      .catch(displayError);
  };

  const shouldFormatOnSave = () => {
    const workspaceFormatOnSave = nova.workspace.config.get(
      "gttmnn.erb-formatter.formatOnSave",
      "string",
    );
    const globalFormatOnSave = nova.config.get(
      "gttmnn.erb-formatter.formatOnSave",
      "boolean",
    );

    switch (workspaceFormatOnSave) {
      case "enabled":
        return true;
      case "disabled":
        return false;
      case "global":
      default:
        return globalFormatOnSave;
    }
  };

  nova.workspace.onDidAddTextEditor((editor) => {
    if (editor.document.syntax !== "html+erb") return;

    editor.onWillSave((editor) => {
      if (shouldFormatOnSave()) {
        return formatDocument(editor);
      }
    });
  });

  nova.commands.register("erb-formatter.format", formatDocument);
};

exports.deactivate = () => {};
