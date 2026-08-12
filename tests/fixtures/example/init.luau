--!strict
-- The entire machine, from the top. Order is execution order.
local niwa = require("@niwa")

require("@self/modules/cli")
require("@self/modules/apps")
require("@self/modules/shell")
require("@self/modules/dev")
require("@self/modules/desktop")
require("@self/modules/system")
require("@self/modules/services")
require("@self/modules/inbox")

niwa.host() -- hosts/<this machine>.luau, if it exists, loaded last
