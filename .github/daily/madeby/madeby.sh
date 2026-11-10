# Who made this work: a free model, DeepSeek, or Claude.
#
#   source .github/daily/madeby/madeby.sh
#   made_by crouton-alpha-free     # or beam-free, deepseek-v4.1-flash, Claude
#
# Sets the git author and committer for the next commits to the model's
# name, and puts this folder's `gh` first on PATH, so every comment, issue
# and pull request gh creates ends with "Made by: ..." and the issue gets
# the matching label (`made by: free model`, `made by: DeepSeek`,
# `made by: Claude`).
MADEBY_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
made_by() {
  local email
  case "$1" in
    *-free|*free) MADE_BY="free model ($1)"; MADE_BY_LABEL="made by: free model"; email=free-model@agents.rtd-system-map.invalid ;;
    deepseek*) MADE_BY="DeepSeek ($1)"; MADE_BY_LABEL="made by: DeepSeek"; email=deepseek@agents.rtd-system-map.invalid ;;
    claude|Claude) MADE_BY="Claude"; MADE_BY_LABEL="made by: Claude"; email=noreply@anthropic.com ;;
    *) MADE_BY="$1"; MADE_BY_LABEL=""; email=agent@agents.rtd-system-map.invalid ;;
  esac
  export MADE_BY MADE_BY_LABEL
  export GIT_AUTHOR_NAME="$MADE_BY" GIT_AUTHOR_EMAIL="$email"
  export GIT_COMMITTER_NAME="$MADE_BY" GIT_COMMITTER_EMAIL="$email"
  case ":$PATH:" in *":$MADEBY_DIR:"*) ;; *) export PATH="$MADEBY_DIR:$PATH" ;; esac
}
