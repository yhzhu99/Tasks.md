/**
 * Utility functions for manipulating card content (people, tags, due dates,
 * etc.). These functions are shared between the single-card editor, bulk
 * operations and the people view.
 */

const TOKEN_PATTERN = (prefix) => new RegExp(`\\[${prefix}:(.*?)\\]`, "g");

/**
 * Extract tokens (e.g. tags, people) from card content
 * @param {string} content - Card content
 * @param {string} prefix - Token prefix, e.g. "tag" or "person"
 * @returns {string[]} Array of token values
 */
function getTokensFromContent(content, prefix) {
  const text = content || "";
  return [...text.matchAll(TOKEN_PATTERN(prefix))]
    .map((match) => match[1].trim())
    .filter((token) => token !== "");
}

/**
 * Add a token (e.g. tag or person) to the beginning of card content
 * @param {string} content - Current card content
 * @param {string} prefix - Token prefix, e.g. "tag" or "person"
 * @param {string} value - Token value to add
 * @returns {string} Updated content with token added
 */
function addTokenToContent(content, prefix, value) {
  const actualContent = content || "";
  const emptyLineIfFirstToken = [...actualContent.matchAll(TOKEN_PATTERN(prefix))]
    .length
    ? ""
    : "\n\n";
  const newToken = value.trim();
  return `[${prefix}:${newToken}] ${emptyLineIfFirstToken}${actualContent}`;
}

/**
 * Remove a token (e.g. tag or person) from card content
 * @param {string} content - Current card content
 * @param {string} prefix - Token prefix, e.g. "tag" or "person"
 * @param {string} value - Token value to remove
 * @returns {string} Updated content with token removed
 */
function removeTokenFromContent(content, prefix, value) {
  const currentContent = content || "";
  const tokenWithBrackets = `[${prefix}:${value}]`;
  const tokenWithBracketsAndSpace = `${tokenWithBrackets} `;
  let tokenLength = tokenWithBracketsAndSpace.length;
  let indexOfToken = currentContent
    .toLowerCase()
    .indexOf(tokenWithBracketsAndSpace.toLowerCase());

  if (indexOfToken === -1) {
    indexOfToken = currentContent
      .toLowerCase()
      .indexOf(tokenWithBrackets.toLowerCase());
    tokenLength = tokenWithBrackets.length;
  }

  if (indexOfToken === -1) {
    return currentContent; // Token not found
  }

  return `${currentContent.substring(0, indexOfToken)}${currentContent.substring(
    indexOfToken + tokenLength,
    currentContent.length
  )}`;
}

/**
 * Add a tag to card content
 * @param {string} content - Current card content
 * @param {string} tagName - Tag name to add
 * @returns {string} Updated content with tag added
 */
export function addTagToContent(content, tagName) {
  return addTokenToContent(content, "tag", tagName);
}

/**
 * Remove a tag from card content
 * @param {string} content - Current card content
 * @param {string} tagName - Tag name to remove
 * @returns {string} Updated content with tag removed
 */
export function removeTagFromContent(content, tagName) {
  return removeTokenFromContent(content, "tag", tagName);
}

/**
 * Extract tags from card content
 * @param {string} content - Card content
 * @returns {string[]} Array of tag names
 */
export function getTagsFromContent(content) {
  return getTokensFromContent(content, "tag");
}

/**
 * Add a person (assignee) to card content
 * @param {string} content - Current card content
 * @param {string} personName - Person name to add
 * @returns {string} Updated content with person added
 */
export function addPersonToContent(content, personName) {
  return addTokenToContent(content, "person", personName);
}

/**
 * Remove a person (assignee) from card content
 * @param {string} content - Current card content
 * @param {string} personName - Person name to remove
 * @returns {string} Updated content with person removed
 */
export function removePersonFromContent(content, personName) {
  return removeTokenFromContent(content, "person", personName);
}

/**
 * Extract people (assignees) from card content
 * @param {string} content - Card content
 * @returns {string[]} Array of person names
 */
export function getPeopleFromContent(content) {
  return getTokensFromContent(content, "person");
}

/**
 * Set or update due date in card content
 * @param {string} content - Current card content
 * @param {string} newDueDate - New due date (YYYY-MM-DD format)
 * @returns {string} Updated content with due date set/updated
 */
export function setDueDateInContent(content, newDueDate) {
  const currentContent = content || "";

  // Check if card already has a due date
  const dueDateStringMatch = currentContent.match(/\[due:(.*?)\]/);
  const existingDueDate = dueDateStringMatch?.[1];

  const newDueDateTag = `[due:${newDueDate}]`;

  if (existingDueDate) {
    // Replace existing due date
    return currentContent.replace(`[due:${existingDueDate}]`, newDueDateTag);
  } else {
    // Add due date at the beginning
    return `${newDueDateTag}\n\n${currentContent}`;
  }
}

/**
 * Extract due date from card content
 * @param {string} content - Card content
 * @returns {string|null} Due date string or null if not found
 */
export function getDueDateFromContent(content) {
  if (!content) {
    return null;
  }
  const dueDateStringMatch = content.match(/\[due:(.*?)\]/);
  if (!dueDateStringMatch?.length) {
    return null;
  }
  return dueDateStringMatch[1];
}
