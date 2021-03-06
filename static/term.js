/**
 * Javascript Terminal
 *
 * Copyright (c) 2011 Fabrice Bellard
 *
 * Redistribution or commercial use is prohibited without the author's
 * permission.
*/

;(function() {

/**
 * Originally taken from [http://bellard.org/jslinux/]
 * with the author's permission.
 */

'use strict';

/**
 * States
 */

var normal = 0
  , escaped = 1
  , csi = 2
  , osc = 3;

/**
 * Terminal
 */

function Term(cols, rows, handler) {
  this.cols = cols;
  this.rows = rows;
  this.currentHeight = rows;
  this.totalHeight = 1000;
  this.ybase = 0;
  this.ydisp = 0;
  this.x = 0;
  this.y = 0;
  this.cursorState = 0;
  this.cursorHidden = false;
  this.handler = handler;
  this.convertEol = false;
  this.state = 0;
  this.outputQueue = '';
  this.scrollTop = 0;
  this.scrollBottom = this.rows - 1;

  this.bgColors = [
    '#000000',
    '#ff0000',
    '#00ff00',
    '#ffff00',
    '#0000ff',
    '#ff00ff',
    '#00ffff',
    '#ffffff'
  ];

  this.fgColors = [
    '#000000',
    '#ff0000',
    '#00ff00',
    '#ffff00',
    '#0000ff',
    '#ff00ff',
    '#00ffff',
    '#ffffff'
  ];

  this.defAttr = (7 << 3) | 0;
  this.curAttr = this.defAttr;
  this.isMac = ~navigator.userAgent.indexOf('Mac');
  this.keyState = 0;
  this.keyStr = '';

  this.params = [];
  this.currentParam = 0;

  this.element = document.createElement('table');
}

Term.prototype.open = function() {
  var self = this
    , html = ''
    , line
    , y
    , i
    , ch;

  this.lines = [];
  ch = 32 | (this.defAttr << 16);

  for (y = 0; y < this.currentHeight; y++) {
    line = [];
    for (i = 0; i < this.cols; i++) {
      line[i] = ch;
    }
    this.lines[y] = line;
  }

  for (y = 0; y < this.rows; y++) {
    html += '<tr><td class="term" id="tline' + y + '"></td></tr>';
  }

  this.element.innerHTML = html;
  document.body.appendChild(this.element);

  this.refresh(0, this.rows - 1);

  document.addEventListener('keydown', function(key) {
    return self.keyDownHandler(key);
  }, true);

  document.addEventListener('keypress', function(key) {
    return self.keyPressHandler(key);
  }, true);

  setInterval(function() {
    self.cursorBlink();
  }, 500);
};

Term.prototype.refresh = function(start, end) {
  var element
    , x
    , y
    , i
    , line
    , out
    , ch
    , width
    , data
    , defAttr
    , fgColor
    , bgColor
    , row;

  for (y = start; y <= end; y++) {
    row = y + this.ydisp;
    if (row >= this.currentHeight) {
      row -= this.currentHeight;
    }

    line = this.lines[row];
    out = '';
    width = this.cols;

    if (y === this.y
        && this.cursorState
        && this.ydisp === this.ybase
        && !this.cursorHidden) {
      x = this.x;
    } else {
      x = -1;
    }

    defAttr = this.defAttr;

    for (i = 0; i < width; i++) {
      ch = line[i];
      data = ch >> 16;
      ch &= 0xffff;
      if (i === x) {
        data = -1;
      }

      if (data !== defAttr) {
        if (defAttr !== this.defAttr)
          out += '</span>';
        if (data !== this.defAttr) {
          if (data === -1) {
            out += '<span class="termReverse">';
          } else {
            out += '<span style="';
            fgColor = (data >> 3) & 7;
            bgColor = data & 7;
            if (fgColor !== 7) {
              out += 'color:'
                + this.fgColors[fgColor]
                + ';';
            }
            if (bgColor !== 0) {
              out += 'background-color:'
                + this.bgColors[bgColor]
                + ';';
            }
            if ((data >> 8) & 1) {
              out += 'font-weight:bold;';
            }
            if ((data >> 8) & 4) {
              out += 'text-decoration:underline;';
            }
            out += '">';
          }
        }
      }

      switch (ch) {
        case 32:
          out += '&nbsp;';
          break;
        case 38:
          out += '&amp;';
          break;
        case 60:
          out += '&lt;';
          break;
        case 62:
          out += '&gt;';
          break;
        default:
          if (ch < 32) {
            out += '&nbsp;';
          } else {
            out += String.fromCharCode(ch);
          }
          break;
      }

      defAttr = data;
    }

    if (defAttr !== this.defAttr) {
      out += '</span>';
    }

    element = document.getElementById('tline' + y);
    element.innerHTML = out;
  }
};

Term.prototype.cursorBlink = function() {
  this.cursorState ^= 1;
  this.refresh(this.y, this.y);
};

Term.prototype.showCursor = function() {
  if (!this.cursorState) {
    this.cursorState = 1;
    this.refresh(this.y, this.y);
  }
};

Term.prototype.scroll = function() {
  var line, x, ch, row;

  if (this.currentHeight < this.totalHeight) {
    this.currentHeight++;
  }

  if (++this.ybase === this.currentHeight) {
    this.ybase = 0;
  }

  this.ydisp = this.ybase;
  ch = 32 | (this.defAttr << 16);

  line = [];
  for (x = 0; x < this.cols; x++) {
    line[x] = ch;
  }

  row = this.ybase + this.rows - 1;

  if (row >= this.currentHeight) {
    row -= this.currentHeight;
  }

  var b = this.scrollBottom + this.ybase;
  if (row > b) {
    var j = this.rows - 1 - this.scrollBottom;
    this.lines.splice(this.rows - 1 + this.ybase - j, 0, line);
  } else {
    this.lines[row] = line;
  }

  if (this.scrollTop !== 0) {
    this.ybase--;
    this.ydisp = this.ybase;
    this.lines.splice(this.ybase + this.scrollTop, 1);
  }
};

Term.prototype.scrollDisp = function(disp) {
  var i, row;

  if (disp >= 0) {
    for (i = 0; i < disp; i++) {
      if (this.ydisp === this.ybase) {
        break;
      }
      if (++this.ydisp === this.currentHeight) {
        this.ydisp = 0;
      }
    }
  } else {
    disp = -disp;
    row = this.ybase + this.rows;

    if (row >= this.currentHeight) {
      row -= this.currentHeight;
    }

    for (i = 0; i < disp; i++) {
      if (this.ydisp === row) break;
      if (--this.ydisp < 0) {
        this.ydisp = this.currentHeight - 1;
      }
    }
  }

  this.refresh(0, this.rows - 1);
};

Term.prototype.write = function(str) {
  //console.log(JSON.stringify(str.replace(/\x1b/g, '^[')));

  var l = str.length
    , i = 0
    , ch
    , param
    , row;

  this.refreshStart = this.rows;
  this.refreshEnd = -1;
  this.getRows(this.y);

  if (this.ybase !== this.ydisp) {
    this.ydisp = this.ybase;
    this.refreshStart = 0;
    this.refreshEnd = this.rows - 1;
  }

  for (; i < l; i++) {
    ch = str.charCodeAt(i);
    switch (this.state) {
      case normal:
        switch (ch) {
          // '\0'
          case 0:
            break;

          // '\a'
          case 7:
            this.bell();
            break;

          // '\n', '\v', '\f'
          case 10:
          case 11:
          case 12:
            if (this.convertEol) {
              this.x = 0;
            }
            this.y++;
            if (this.y >= this.scrollBottom + 1) {
              this.y--;
              this.scroll();
              this.refreshStart = 0;
              this.refreshEnd = this.rows - 1;
            }
            break;

          // '\r'
          case 13:
            this.x = 0;
            break;

          // '\b'
          case 8:
            if (this.x > 0) {
              this.x--;
            }
            break;

          // '\t'
          case 9:
            // should check tabstops
            param = (this.x + 8) & ~7;
            if (param <= this.cols) {
              this.x = param;
            }
            break;

          // '\e'
          case 27:
            this.state = escaped;
            break;

          default:
            // ' '
            if (ch >= 32) {
              if (this.x >= this.cols) {
                this.x = 0;
                this.y++;
                if (this.y >= this.scrollBottom + 1) {
                  this.y--;
                  this.scroll();
                  this.refreshStart = 0;
                  this.refreshEnd = this.rows - 1;
                }
              }
              row = this.y + this.ybase;
              if (row >= this.currentHeight) {
                row -= this.currentHeight;
              }
              this.lines[row][this.x] = (ch & 0xffff) | (this.curAttr << 16);
              this.x++;
              this.getRows(this.y);
            }
            break;
        }
        break;
      case escaped:
        switch (str[i]) {
          case '[': // csi
            this.params = [];
            this.currentParam = 0;
            this.state = csi;
            break;

          case ']': // osc
            this.params = [];
            this.currentParam = 0;
            this.state = osc;
            break;

          case 'P': // dcs
            this.state = osc;
            break;

          case '_': // apc
            this.state = osc;
            break;

          case '^': // pm
            this.state = osc;
            break;

          case 'c': // full reset
            this.reset();
            break;

          case 'E': // next line
            this.x = 0;
            ; // FALL-THROUGH
          case 'D': // index
            this.index();
            break;

          case 'M': // reverse index
            this.reverseIndex();
            break;

          case '%': // encoding changes
          case '(':
          case ')':
          case '*':
          case '+':
          case '-':
          case '.':
          case '/':
            console.log('Serial port requested encoding change');
            this.state = normal;
            break;

          case '7': // save cursor pos
            this.saveCursor();
            this.state = normal;
            break;

          case '8': // restore cursor pos
            this.restoreCursor();
            this.state = normal;
            break;

          case '#': // line height/width
            this.state = normal;
            break;

          case 'H': // tab set
            // this.tabSet(this.x);
            this.state = normal;
            break;

          default:
            this.state = normal;
            break;
        }
        break;

      case osc:
        if (ch !== 27 && ch !== 7) break;
        console.log('Unknown OSC code.');
        this.state = normal;
        // increment for the trailing slash in ST
        if (ch === 27) i++;
        break;

      case csi:
        // '?' or '>'
        if (ch === 63 || ch === 62) {
          this.prefix = str[i];
          break;
        }

        // 0 - 9
        if (ch >= 48 && ch <= 57) {
          this.currentParam = this.currentParam * 10 + ch - 48;
        } else {
          this.params[this.params.length] = this.currentParam;
          this.currentParam = 0;

          // ';'
          if (ch === 59) break;

          // '$', '"', ' ', '\''
          if (ch === 36 || ch === 34 || ch === 32 || ch === 39) {
            this.postfix = str[i];
            break;
          }

          this.state = normal;

          switch (ch) {
            // CSI Ps A
            // Cursor Up Ps Times (default = 1) (CUU).
            case 65:
              this.cursorUp(this.params);
              break;

            // CSI Ps B
            // Cursor Down Ps Times (default = 1) (CUD).
            case 66:
              this.cursorDown(this.params);
              break;

            // CSI Ps C
            // Cursor Forward Ps Times (default = 1) (CUF).
            case 67:
              this.cursorForward(this.params);
              break;

            // CSI Ps D
            // Cursor Backward Ps Times (default = 1) (CUB).
            case 68:
              this.cursorBackward(this.params);
              break;

            // CSI Ps ; Ps H
            // Cursor Position [row;column] (default = [1,1]) (CUP).
            case 72:
              this.cursorPos(this.params);
              break;

            // CSI Ps J  Erase in Display (ED).
            case 74:
              this.eraseInDisplay(this.params);
              break;

            // CSI Ps K  Erase in Line (EL).
            case 75:
              this.eraseInLine(this.params);
              break;

            // CSI Pm m  Character Attributes (SGR).
            case 109:
              this.charAttributes(this.params);
              break;

            // CSI Ps n  Device Status Report (DSR).
            case 110:
              this.deviceStatus(this.params);
              break;

            /**
             * Additions
             */

            // CSI Ps @
            // Insert Ps (Blank) Character(s) (default = 1) (ICH).
            case 64:
              this.insertChars(this.params);
              break;

            // CSI Ps E
            // Cursor Next Line Ps Times (default = 1) (CNL).
            case 69:
              this.cursorNextLine(this.params);
              break;

            // CSI Ps F
            // Cursor Preceding Line Ps Times (default = 1) (CNL).
            case 70:
              this.cursorPrecedingLine(this.params);
              break;

            // CSI Ps G
            // Cursor Character Absolute  [column] (default = [row,1]) (CHA).
            case 71:
              this.cursorCharAbsolute(this.params);
              break;

            // CSI Ps L
            // Insert Ps Line(s) (default = 1) (IL).
            case 76:
              this.insertLines(this.params);
              break;

            // CSI Ps M
            // Delete Ps Line(s) (default = 1) (DL).
            case 77:
              this.deleteLines(this.params);
              break;

            // CSI Ps P
            // Delete Ps Character(s) (default = 1) (DCH).
            case 80:
              this.deleteChars(this.params);
              break;

            // CSI Ps X
            // Erase Ps Character(s) (default = 1) (ECH).
            case 88:
              this.eraseChars(this.params);
              break;

            // CSI Pm `  Character Position Absolute
            //   [column] (default = [row,1]) (HPA).
            case 96:
              this.charPosAbsolute(this.params);
              break;

            // 141 61 a * HPR -
            // Horizontal Position Relative
            case 97:
              this.HPositionRelative(this.params);
              break;

            // CSI P s c
            // Send Device Attributes (Primary DA).
            // CSI > P s c
            // Send Device Attributes (Secondary DA)
            case 99:
              this.sendDeviceAttributes(this.params);
              break;

            // CSI Pm d
            // Line Position Absolute  [row] (default = [1,column]) (VPA).
            case 100:
              this.linePosAbsolute(this.params);
              break;

            // 145 65 e * VPR - Vertical Position Relative
            case 101:
              this.VPositionRelative(this.params);
              break;

            // CSI Ps ; Ps f
            //   Horizontal and Vertical Position [row;column] (default =
            //   [1,1]) (HVP).
            case 102:
              this.HVPosition(this.params);
              break;

            // CSI Pm h  Set Mode (SM).
            // CSI ? Pm h - mouse escape codes, cursor escape codes
            case 104:
              this.setMode(this.params);
              break;

            // CSI Pm l  Reset Mode (RM).
            // CSI ? Pm l
            case 108:
              this.resetMode(this.params);
              break;

            // CSI Ps ; Ps r
            //   Set Scrolling Region [top;bottom] (default = full size of win-
            //   dow) (DECSTBM).
            // CSI ? Pm r
            case 114:
              this.setScrollRegion(this.params);
              break;

            // CSI s     Save cursor (ANSI.SYS).
            case 115:
              this.saveCursor(this.params);
              break;

            // CSI u     Restore cursor (ANSI.SYS).
            case 117:
              this.restoreCursor(this.params);
              break;

            /**
             * Lesser Used
             */

            // CSI Ps I
            // Cursor Forward Tabulation Ps tab stops (default = 1) (CHT).
            case 73:
              this.cursorForwardTab(this.params);
              break;

            // CSI Ps S  Scroll up Ps lines (default = 1) (SU).
            case 83:
              this.scrollUp(this.params);
              break;

            // CSI Ps T  Scroll down Ps lines (default = 1) (SD).
            // CSI Ps ; Ps ; Ps ; Ps ; Ps T
            // CSI > Ps; Ps T
            case 84:
              if (this.prefix === '>') {
                this.resetTitleModes(this.params);
                break;
              }
              if (this.params.length > 1) {
                this.initMouseTracking(this.params);
                break;
              }
              this.scrollDown(this.params);
              break;

            // CSI Ps Z
            // Cursor Backward Tabulation Ps tab stops (default = 1) (CBT).
            case 90:
              this.cursorBackwardTab(this.params);
              break;

            // CSI Ps b  Repeat the preceding graphic character Ps times (REP).
            // case 98:
            //   this.repeatPrecedingCharacter(this.params);
            //   break;

            // CSI Ps g  Tab Clear (TBC).
            // case 103:
            //   this.tabClear(this.params);
            //   break;

            // CSI Pm i  Media Copy (MC).
            // CSI ? Pm i
            // case 105:
            //   this.mediaCopy(this.params);
            //   break;

            // CSI Pm m  Character Attributes (SGR).
            // CSI > Ps; Ps m
            // case 109: // duplicate
            //   if (this.prefix === '>') {
            //     this.setResources(this.params);
            //   } else {
            //     this.charAttributes(this.params);
            //   }
            //   break;

            // CSI Ps n  Device Status Report (DSR).
            // CSI > Ps n
            // case 110: // duplicate
            //   if (this.prefix === '>') {
            //     this.disableModifiers(this.params);
            //   } else {
            //     this.deviceStatus(this.params);
            //   }
            //   break;

            // CSI > Ps p  Set pointer mode.
            // CSI ! p   Soft terminal reset (DECSTR).
            // CSI Ps$ p
            //   Request ANSI mode (DECRQM).
            // CSI ? Ps$ p
            //   Request DEC private mode (DECRQM).
            // CSI Ps ; Ps " p
            case 112:
              switch (this.prefix) {
                // case '>':
                //   this.setPointerMode(this.params);
                //   break;
                case '!':
                  this.softReset(this.params);
                  break;
                // case '?':
                //   if (this.postfix === '$') {
                //     this.requestPrivateMode(this.params);
                //   }
                //   break;
                // default:
                //   if (this.postfix === '"') {
                //     this.setConformanceLevel(this.params);
                //   } else if (this.postfix === '$') {
                //     this.requestAnsiMode(this.params);
                //   }
                //   break;
              }
              break;

            // CSI Ps q  Load LEDs (DECLL).
            // CSI Ps SP q
            // CSI Ps " q
            // case 113:
            //   if (this.postfix === ' ') {
            //     this.setCursorStyle(this.params);
            //     break;
            //   }
            //   if (this.postfix === '"') {
            //     this.setCharProtectionAttr(this.params);
            //     break;
            //   }
            //   this.loadLEDs(this.params);
            //   break;

            // CSI Ps ; Ps r
            //   Set Scrolling Region [top;bottom] (default = full size of win-
            //   dow) (DECSTBM).
            // CSI ? Pm r
            // CSI Pt; Pl; Pb; Pr; Ps$ r
            // case 114: // duplicate
            //   if (this.prefix === '?') {
            //     this.restorePrivateValues(this.params);
            //   } else if (this.postfix === '$') {
            //     this.setAttrInRectangle(this.params);
            //   } else {
            //     this.setScrollRegion(this.params);
            //   }
            //   break;

            // CSI s     Save cursor (ANSI.SYS).
            // CSI ? Pm s
            // case 115: // duplicate
            //   if (this.prefix === '?') {
            //     this.savePrivateValues(this.params);
            //   } else {
            //     this.saveCursor(this.params);
            //   }
            //   break;

            // CSI Ps ; Ps ; Ps t
            // CSI Pt; Pl; Pb; Pr; Ps$ t
            // CSI > Ps; Ps t
            // CSI Ps SP t
            // case 116:
            //   if (this.postfix === '$') {
            //     this.reverseAttrInRectangle(this.params);
            //   } else if (this.postfix === ' ') {
            //     this.setWarningBellVolume(this.params);
            //   } else {
            //     if (this.prefix === '>') {
            //       this.setTitleModeFeature(this.params);
            //     } else {
            //       this.manipulateWindow(this.params);
            //     }
            //   }
            //   break;

            // CSI u     Restore cursor (ANSI.SYS).
            // CSI Ps SP u
            // case 117: // duplicate
            //   if (this.postfix === ' ') {
            //     this.setMarginBellVolume(this.params);
            //   } else {
            //     this.restoreCursor(this.params);
            //   }
            //   break;

            // CSI Pt; Pl; Pb; Pr; Pp; Pt; Pl; Pp$ v
            // case 118:
            //   if (this.postfix === '$') {
            //     this.copyRectagle(this.params);
            //   }
            //   break;

            // CSI Pt ; Pl ; Pb ; Pr ' w
            // case 119:
            //   if (this.postfix === '\'') {
            //     this.enableFilterRectangle(this.params);
            //   }
            //   break;

            // CSI Ps x  Request Terminal Parameters (DECREQTPARM).
            // CSI Ps x  Select Attribute Change Extent (DECSACE).
            // CSI Pc; Pt; Pl; Pb; Pr$ x
            // case 120:
            //   if (this.postfix === '$') {
            //     this.fillRectangle(this.params);
            //   } else {
            //     this.requestParameters(this.params);
            //     //this.__(this.params);
            //   }
            //   break;

            // CSI Ps ; Pu ' z
            // CSI Pt; Pl; Pb; Pr$ z
            // case 122:
            //   if (this.postfix === '\'') {
            //     this.enableLocatorReporting(this.params);
            //   } else if (this.postfix === '$') {
            //     this.eraseRectangle(this.params);
            //   }
            //   break;

            // CSI Pm ' {
            // CSI Pt; Pl; Pb; Pr$ {
            // case 123:
            //   if (this.postfix === '\'') {
            //     this.setLocatorEvents(this.params);
            //   } else if (this.postfix === '$') {
            //     this.selectiveEraseRectangle(this.params);
            //   }
            //   break;

            // CSI Ps ' |
            // case 124:
            //   if (this.postfix === '\'') {
            //     this.requestLocatorPosition(this.params);
            //   }
            //   break;

            default:
              console.log(
                'Unknown CSI code: %s',
                str[i], this.params);
              break;
          }

          this.prefix = '';
          this.postfix = '';
        }
        break;
    }
  }

  this.getRows(this.y);

  if (this.refreshEnd >= this.refreshStart) {
    this.refresh(this.refreshStart, this.refreshEnd);
  }
};

Term.prototype.writeln = function(str) {
  this.write(str + '\r\n');
};

Term.prototype.keyDownHandler = function(ev) {
  var str = '';
  switch (ev.keyCode) {
    // backspace
    case 8:
      str = '\x7f'; // ^?
      //str = '\x08'; // ^H
      break;
    // tab
    case 9:
      str = '\t';
      break;
    // return/enter
    case 13:
      str = '\r';
      break;
    // escape
    case 27:
      str = '\x1b';
      break;
    // left-arrow
    case 37:
      str = '\x1b[D';
      break;
    // right-arrow
    case 39:
      str = '\x1b[C';
      break;
    // up-arrow
    case 38:
      if (ev.ctrlKey) {
        this.scrollDisp(-1);
      } else {
        str = '\x1b[A';
      }
      break;
    // down-arrow
    case 40:
      if (ev.ctrlKey) {
        this.scrollDisp(1);
      } else {
        str = '\x1b[B';
      }
      break;
    // delete
    case 46:
      str = '\x1b[3~';
      break;
    // insert
    case 45:
      str = '\x1b[2~';
      break;
    // home
    case 36:
      str = '\x1bOH';
      break;
    // end
    case 35:
      str = '\x1bOF';
      break;
    // page up
    case 33:
      if (ev.ctrlKey) {
        this.scrollDisp(-(this.rows - 1));
      } else {
        str = '\x1b[5~';
      }
      break;
    // page down
    case 34:
      if (ev.ctrlKey) {
        this.scrollDisp(this.rows - 1);
      } else {
        str = '\x1b[6~';
      }
      break;
    default:
      // a-z and space
      if (ev.ctrlKey) {
        if (ev.keyCode >= 65 && ev.keyCode <= 90) {
          str = String.fromCharCode(ev.keyCode - 64);
        } else if (ev.keyCode === 32) {
          str = String.fromCharCode(0);
        }
      } else if ((!this.isMac && ev.altKey) || (this.isMac && ev.metaKey)) {
        if (ev.keyCode >= 65 && ev.keyCode <= 90) {
          str = '\x1b' + String.fromCharCode(ev.keyCode + 32);
        }
      }
      break;
  }

  if (str) {
    if (ev.stopPropagation) ev.stopPropagation();
    if (ev.preventDefault) ev.preventDefault();

    this.showCursor();
    this.keyState = 1;
    this.keyStr = str;
    this.handler(str);

    return false;
  } else {
    this.keyState = 0;
    return true;
  }
};

Term.prototype.keyPressHandler = function(ev) {
  var str = ''
    , key;

  if (ev.stopPropagation) ev.stopPropagation();
  if (ev.preventDefault) ev.preventDefault();

  if (!('charCode' in ev)) {
    key = ev.keyCode;
    if (this.keyState === 1) {
      this.keyState = 2;
      return false;
    } else if (this.keyState === 2) {
      this.showCursor();
      this.handler(this.keyStr);
      return false;
    }
  } else {
    key = ev.charCode;
  }

  if (key !== 0) {
    if (!ev.ctrlKey
        && ((!this.isMac && !ev.altKey)
        || (this.isMac && !ev.metaKey))) {
      str = String.fromCharCode(key);
    }
  }

  if (str) {
    this.showCursor();
    this.handler(str);
    return false;
  } else {
    return true;
  }
};

Term.prototype.queueChars = function(str) {
  var self = this;

  this.outputQueue += str;

  if (this.outputQueue) {
    setTimeout(function() {
      self.outputHandler();
    }, 1);
  }
};

Term.prototype.outputHandler = function() {
  if (this.outputQueue) {
    this.handler(this.outputQueue);
    this.outputQueue = '';
  }
};

Term.prototype.bell = function() {
  if (!this.useBell) return;
  var self = this;
  this.element.style.borderColor = 'white';
  setTimeout(function() {
    self.element.style.borderColor = '';
  }, 10);
};

Term.prototype.getRows = function(y) {
  this.refreshStart = Math.min(this.refreshStart, y);
  this.refreshEnd = Math.max(this.refreshEnd, y);
};

Term.prototype.eraseLine = function(x, y) {
  var line, i, ch, row;

  row = this.ybase + y;

  if (row >= this.currentHeight) {
    row -= this.currentHeight;
  }

  line = this.lines[row];
  ch = 32 | (this.defAttr << 16);

  for (i = x; i < this.cols; i++) {
    line[i] = ch;
  }

  this.getRows(y);
};

Term.prototype.blankLine = function() {
  var ch = 32 | (this.defAttr << 16)
    , line = []
    , i = 0;

  for (; i < this.cols; i++) {
    line[i] = ch;
  }

  return line;
};

/**
 * ESC
 */

// ESC D Index (IND is 0x84).
Term.prototype.index = function() {
  this.y++;
  if (this.y >= this.scrollBottom + 1) {
    this.y--;
    this.scroll();
    this.refreshStart = 0;
    this.refreshEnd = this.rows - 1;
  }
  this.state = normal;
};

// ESC M Reverse Index (RI is 0x8d).
Term.prototype.reverseIndex = function() {
  var j;
  this.y--;
  if (this.y < this.scrollTop) {
    this.y++;
    this.lines.splice(this.y + this.ybase, 0, []);
    this.eraseLine(this.x, this.y);
    j = this.rows - 1 - this.scrollBottom;
    // add an extra one because we just added a line
    // maybe put this above
    this.lines.splice(this.rows - 1 + this.ybase - j + 1, 1);
  }
  this.state = normal;
};

// ESC c Full Reset (RIS).
Term.prototype.reset = function() {
  this.currentHeight = this.rows;
  this.ybase = 0;
  this.ydisp = 0;
  this.x = 0;
  this.y = 0;
  this.cursorState = 0;
  this.convertEol = false;
  this.state = 0;
  this.outputQueue = '';
  this.scrollTop = 0;
  this.scrollBottom = this.rows - 1;

  var j = this.rows - 1;
  this.lines = [ this.blankLine() ];
  while (j--) {
    this.lines.push(this.lines[0].slice());
  }
};

/**
 * CSI
 */

// CSI Ps A
// Cursor Up Ps Times (default = 1) (CUU).
Term.prototype.cursorUp = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.y -= param;
  if (this.y < 0) this.y = 0;
};

// CSI Ps B
// Cursor Down Ps Times (default = 1) (CUD).
Term.prototype.cursorDown = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// CSI Ps C
// Cursor Forward Ps Times (default = 1) (CUF).
Term.prototype.cursorForward = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.x += param;
  if (this.x >= this.cols - 1) {
    this.x = this.cols - 1;
  }
};

// CSI Ps D
// Cursor Backward Ps Times (default = 1) (CUB).
Term.prototype.cursorBackward = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.x -= param;
  if (this.x < 0) this.x = 0;
};

// CSI Ps ; Ps H
// Cursor Position [row;column] (default = [1,1]) (CUP).
Term.prototype.cursorPos = function(params) {
  var param, row, col;

  row = this.params[0] - 1;

  if (this.params.length >= 2) {
    col = this.params[1] - 1;
  } else {
    col = 0;
  }

  if (row < 0) {
    row = 0;
  } else if (row >= this.rows) {
    row = this.rows - 1;
  }

  if (col < 0) {
    col = 0;
  } else if (col >= this.cols) {
    col = this.cols - 1;
  }

  this.x = col;
  this.y = row;
};

// CSI Ps J  Erase in Display (ED).
//     Ps = 0  -> Erase Below (default).
//     Ps = 1  -> Erase Above.
//     Ps = 2  -> Erase All.
//     Ps = 3  -> Erase Saved Lines (xterm).
// CSI ? Ps J
//   Erase in Display (DECSED).
//     Ps = 0  -> Selective Erase Below (default).
//     Ps = 1  -> Selective Erase Above.
//     Ps = 2  -> Selective Erase All.
// Not fully implemented.
Term.prototype.eraseInDisplay = function(params) {
  var param, row, j;
  this.eraseLine(this.x, this.y);
  for (j = this.y + 1; j < this.rows; j++) {
    this.eraseLine(0, j);
  }
};

// CSI Ps K  Erase in Line (EL).
//     Ps = 0  -> Erase to Right (default).
//     Ps = 1  -> Erase to Left.
//     Ps = 2  -> Erase All.
// CSI ? Ps K
//   Erase in Line (DECSEL).
//     Ps = 0  -> Selective Erase to Right (default).
//     Ps = 1  -> Selective Erase to Left.
//     Ps = 2  -> Selective Erase All.
// Not fully implemented.
Term.prototype.eraseInLine = function(params) {
  this.eraseLine(this.x, this.y);
};

// CSI Pm m  Character Attributes (SGR).
//     Ps = 0  -> Normal (default).
//     Ps = 1  -> Bold.
//     Ps = 4  -> Underlined.
//     Ps = 5  -> Blink (appears as Bold).
//     Ps = 7  -> Inverse.
//     Ps = 8  -> Invisible, i.e., hidden (VT300).
//     Ps = 2 2  -> Normal (neither bold nor faint).
//     Ps = 2 4  -> Not underlined.
//     Ps = 2 5  -> Steady (not blinking).
//     Ps = 2 7  -> Positive (not inverse).
//     Ps = 2 8  -> Visible, i.e., not hidden (VT300).
//     Ps = 3 0  -> Set foreground color to Black.
//     Ps = 3 1  -> Set foreground color to Red.
//     Ps = 3 2  -> Set foreground color to Green.
//     Ps = 3 3  -> Set foreground color to Yellow.
//     Ps = 3 4  -> Set foreground color to Blue.
//     Ps = 3 5  -> Set foreground color to Magenta.
//     Ps = 3 6  -> Set foreground color to Cyan.
//     Ps = 3 7  -> Set foreground color to White.
//     Ps = 3 9  -> Set foreground color to default (original).
//     Ps = 4 0  -> Set background color to Black.
//     Ps = 4 1  -> Set background color to Red.
//     Ps = 4 2  -> Set background color to Green.
//     Ps = 4 3  -> Set background color to Yellow.
//     Ps = 4 4  -> Set background color to Blue.
//     Ps = 4 5  -> Set background color to Magenta.
//     Ps = 4 6  -> Set background color to Cyan.
//     Ps = 4 7  -> Set background color to White.
//     Ps = 4 9  -> Set background color to default (original).

//   If 16-color support is compiled, the following apply.  Assume
//   that xterm's resources are set so that the ISO color codes are
//   the first 8 of a set of 16.  Then the aixterm colors are the
//   bright versions of the ISO colors:
//     Ps = 9 0  -> Set foreground color to Black.
//     Ps = 9 1  -> Set foreground color to Red.
//     Ps = 9 2  -> Set foreground color to Green.
//     Ps = 9 3  -> Set foreground color to Yellow.
//     Ps = 9 4  -> Set foreground color to Blue.
//     Ps = 9 5  -> Set foreground color to Magenta.
//     Ps = 9 6  -> Set foreground color to Cyan.
//     Ps = 9 7  -> Set foreground color to White.
//     Ps = 1 0 0  -> Set background color to Black.
//     Ps = 1 0 1  -> Set background color to Red.
//     Ps = 1 0 2  -> Set background color to Green.
//     Ps = 1 0 3  -> Set background color to Yellow.
//     Ps = 1 0 4  -> Set background color to Blue.
//     Ps = 1 0 5  -> Set background color to Magenta.
//     Ps = 1 0 6  -> Set background color to Cyan.
//     Ps = 1 0 7  -> Set background color to White.

//   If xterm is compiled with the 16-color support disabled, it
//   supports the following, from rxvt:
//     Ps = 1 0 0  -> Set foreground and background color to
//     default.

//   If 88- or 256-color support is compiled, the following apply.
//     Ps = 3 8  ; 5  ; Ps -> Set foreground color to the second
//     Ps.
//     Ps = 4 8  ; 5  ; Ps -> Set background color to the second
//     Ps.
Term.prototype.charAttributes = function(params) {
  var i, p;
  if (params.length === 0) {
    this.curAttr = this.defAttr;
  } else {
    for (i = 0; i < params.length; i++) {
      p = params[i];
      if (p >= 30 && p <= 37) {
        this.curAttr = (this.curAttr & ~(7 << 3)) | ((p - 30) << 3);
      } else if (p >= 40 && p <= 47) {
        this.curAttr = (this.curAttr & ~7) | (p - 40);
      } else if (p === 0) {
        this.curAttr = this.defAttr;
      } else if (p === 1) {
        // bold text
        this.curAttr = this.curAttr | (1 << 8);
      } else if (p === 4) {
        // underlined text
        this.curAttr = this.curAttr | (4 << 8);
      }
    }
  }
};

// CSI Ps n  Device Status Report (DSR).
//     Ps = 5  -> Status Report.  Result (``OK'') is
//   CSI 0 n
//     Ps = 6  -> Report Cursor Position (CPR) [row;column].
//   Result is
//   CSI r ; c R
// CSI ? Ps n
//   Device Status Report (DSR, DEC-specific).
//     Ps = 6  -> Report Cursor Position (CPR) [row;column] as CSI
//     ? r ; c R (assumes page is zero).
//     Ps = 1 5  -> Report Printer status as CSI ? 1 0  n  (ready).
//     or CSI ? 1 1  n  (not ready).
//     Ps = 2 5  -> Report UDK status as CSI ? 2 0  n  (unlocked)
//     or CSI ? 2 1  n  (locked).
//     Ps = 2 6  -> Report Keyboard status as
//   CSI ? 2 7  ;  1  ;  0  ;  0  n  (North American).
//   The last two parameters apply to VT400 & up, and denote key-
//   board ready and LK01 respectively.
//     Ps = 5 3  -> Report Locator status as
//   CSI ? 5 3  n  Locator available, if compiled-in, or
//   CSI ? 5 0  n  No Locator, if not.
Term.prototype.deviceStatus = function(params) {
  switch (this.params[0]) {
    case 5:
      this.queueChars('\x1b[0n');
      break;
    case 6:
      this.queueChars('\x1b['
        + (this.y+1)
        + ';'
        + (this.x+1)
        + 'R');
      break;
  }
};

/**
 * Additions
 */

// CSI Ps @
// Insert Ps (Blank) Character(s) (default = 1) (ICH).
Term.prototype.insertChars = function(params) {
  var param, row, j;
  param = this.params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  j = this.x;
  while (param-- && j < this.cols) {
    this.lines[row].splice(j++, 0, (this.defAttr << 16) | 32);
    this.lines[row].pop();
  }
};

// CSI Ps E
// Cursor Next Line Ps Times (default = 1) (CNL).
Term.prototype.cursorNextLine = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
  // above is the same as CSI Ps B
  this.x = 0;
};

// CSI Ps F
// Cursor Preceding Line Ps Times (default = 1) (CNL).
Term.prototype.cursorPrecedingLine = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.y -= param;
  if (this.y < 0) this.y = 0;
  // above is the same as CSI Ps A
  this.x = 0;
};

// CSI Ps G
// Cursor Character Absolute  [column] (default = [row,1]) (CHA).
Term.prototype.cursorCharAbsolute = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.x = param;
};

// CSI Ps L
// Insert Ps Line(s) (default = 1) (IL).
Term.prototype.insertLines = function(params) {
  var param, row, j;
  param = this.params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  while (param--) {
    this.lines.splice(row, 0, []);
    this.eraseLine(0, this.y);
    j = this.rows - 1 - this.scrollBottom;
    // add an extra one because we added one
    // above
    j = this.rows - 1 + this.ybase - j + 1;
    this.lines.splice(j, 1);
  }
  //this.refresh(0, this.rows - 1);
  this.refreshStart = 0;
  this.refreshEnd = this.rows - 1;
};

// CSI Ps M
// Delete Ps Line(s) (default = 1) (DL).
Term.prototype.deleteLines = function(params) {
  var param, row, j;
  param = this.params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  while (param--) {
    j = this.rows - 1 - this.scrollBottom;
    j = this.rows - 1 + this.ybase - j;
    this.lines.splice(j + 1, 0, []);
    this.eraseLine(0, j - this.ybase);
    this.lines.splice(row, 1);
  }
  //this.refresh(0, this.rows - 1);
  this.refreshStart = 0;
  this.refreshEnd = this.rows - 1;
};

// CSI Ps P
// Delete Ps Character(s) (default = 1) (DCH).
Term.prototype.deleteChars = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  while (param--) {
    this.lines[row].splice(this.x, 1);
    this.lines.push((this.defAttr << 16) | 32);
  }
};

// CSI Ps X
// Erase Ps Character(s) (default = 1) (ECH).
Term.prototype.eraseChars = function(params) {
  var param, row, j;
  param = this.params[0];
  if (param < 1) param = 1;
  row = this.y + this.ybase;
  j = this.x;
  while (param-- && j < this.cols) {
    this.lines[row][j++] = (this.defAttr << 16) | 32;
  }
};

// CSI Pm `  Character Position Absolute
//   [column] (default = [row,1]) (HPA).
Term.prototype.charPosAbsolute = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.x = param - 1;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// 141 61 a * HPR -
// Horizontal Position Relative
Term.prototype.HPositionRelative = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.x += param;
  if (this.x >= this.cols - 1) {
    this.x = this.cols - 1;
  }
  // above is the same as CSI Ps C
};

// CSI Ps c  Send Device Attributes (Primary DA).
//     Ps = 0  or omitted -> request attributes from terminal.  The
//     response depends on the decTerminalID resource setting.
//     -> CSI ? 1 ; 2 c  (``VT100 with Advanced Video Option'')
//     -> CSI ? 1 ; 0 c  (``VT101 with No Options'')
//     -> CSI ? 6 c  (``VT102'')
//     -> CSI ? 6 0 ; 1 ; 2 ; 6 ; 8 ; 9 ; 1 5 ; c  (``VT220'')
//   The VT100-style response parameters do not mean anything by
//   themselves.  VT220 parameters do, telling the host what fea-
//   tures the terminal supports:
//     Ps = 1  -> 132-columns.
//     Ps = 2  -> Printer.
//     Ps = 6  -> Selective erase.
//     Ps = 8  -> User-defined keys.
//     Ps = 9  -> National replacement character sets.
//     Ps = 1 5  -> Technical characters.
//     Ps = 2 2  -> ANSI color, e.g., VT525.
//     Ps = 2 9  -> ANSI text locator (i.e., DEC Locator mode).
// CSI > Ps c
//   Send Device Attributes (Secondary DA).
//     Ps = 0  or omitted -> request the terminal's identification
//     code.  The response depends on the decTerminalID resource set-
//     ting.  It should apply only to VT220 and up, but xterm extends
//     this to VT100.
//     -> CSI  > Pp ; Pv ; Pc c
//   where Pp denotes the terminal type
//     Pp = 0  -> ``VT100''.
//     Pp = 1  -> ``VT220''.
//   and Pv is the firmware version (for xterm, this was originally
//   the XFree86 patch number, starting with 95).  In a DEC termi-
//   nal, Pc indicates the ROM cartridge registration number and is
//   always zero.
Term.prototype.sendDeviceAttributes = function(params) {
  // this breaks things currently
  return;
  if (this.prefix !== '>') {
    this.queueChars('\x1b[?1;2c');
  } else {
    // say we're a vt100 with
    // firmware version 95
    this.queueChars('\x1b[>0;95;0');
  }
};

// CSI Pm d
// Line Position Absolute  [row] (default = [1,column]) (VPA).
Term.prototype.linePosAbsolute = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.y = param - 1;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
};

// 145 65 e * VPR - Vertical Position Relative
Term.prototype.VPositionRelative = function(params) {
  var param, row;
  param = this.params[0];
  if (param < 1) param = 1;
  this.y += param;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }
  // above is same as CSI Ps B
};

// CSI Ps ; Ps f
//   Horizontal and Vertical Position [row;column] (default =
//   [1,1]) (HVP).
Term.prototype.HVPosition = function(params) {
  if (this.params[0] < 1) this.params[0] = 1;
  if (this.params[1] < 1) this.params[1] = 1;

  this.y = this.params[0] - 1;
  if (this.y >= this.rows) {
    this.y = this.rows - 1;
  }

  this.x = this.params[1] - 1;
  if (this.x >= this.cols) {
    this.x = this.cols - 1;
  }
};

// CSI Pm h  Set Mode (SM).
//     Ps = 2  -> Keyboard Action Mode (AM).
//     Ps = 4  -> Insert Mode (IRM).
//     Ps = 1 2  -> Send/receive (SRM).
//     Ps = 2 0  -> Automatic Newline (LNM).
// CSI ? Pm h
//   DEC Private Mode Set (DECSET).
//     Ps = 1  -> Application Cursor Keys (DECCKM).
//     Ps = 2  -> Designate USASCII for character sets G0-G3
//     (DECANM), and set VT100 mode.
//     Ps = 3  -> 132 Column Mode (DECCOLM).
//     Ps = 4  -> Smooth (Slow) Scroll (DECSCLM).
//     Ps = 5  -> Reverse Video (DECSCNM).
//     Ps = 6  -> Origin Mode (DECOM).
//     Ps = 7  -> Wraparound Mode (DECAWM).
//     Ps = 8  -> Auto-repeat Keys (DECARM).
//     Ps = 9  -> Send Mouse X & Y on button press.  See the sec-
//     tion Mouse Tracking.
//     Ps = 1 0  -> Show toolbar (rxvt).
//     Ps = 1 2  -> Start Blinking Cursor (att610).
//     Ps = 1 8  -> Print form feed (DECPFF).
//     Ps = 1 9  -> Set print extent to full screen (DECPEX).
//     Ps = 2 5  -> Show Cursor (DECTCEM).
//     Ps = 3 0  -> Show scrollbar (rxvt).
//     Ps = 3 5  -> Enable font-shifting functions (rxvt).
//     Ps = 3 8  -> Enter Tektronix Mode (DECTEK).
//     Ps = 4 0  -> Allow 80 -> 132 Mode.
//     Ps = 4 1  -> more(1) fix (see curses resource).
//     Ps = 4 2  -> Enable Nation Replacement Character sets (DECN-
//     RCM).
//     Ps = 4 4  -> Turn On Margin Bell.
//     Ps = 4 5  -> Reverse-wraparound Mode.
//     Ps = 4 6  -> Start Logging.  This is normally disabled by a
//     compile-time option.
//     Ps = 4 7  -> Use Alternate Screen Buffer.  (This may be dis-
//     abled by the titeInhibit resource).
//     Ps = 6 6  -> Application keypad (DECNKM).
//     Ps = 6 7  -> Backarrow key sends backspace (DECBKM).
//     Ps = 1 0 0 0  -> Send Mouse X & Y on button press and
//     release.  See the section Mouse Tracking.
//     Ps = 1 0 0 1  -> Use Hilite Mouse Tracking.
//     Ps = 1 0 0 2  -> Use Cell Motion Mouse Tracking.
//     Ps = 1 0 0 3  -> Use All Motion Mouse Tracking.
//     Ps = 1 0 0 4  -> Send FocusIn/FocusOut events.
//     Ps = 1 0 0 5  -> Enable Extended Mouse Mode.
//     Ps = 1 0 1 0  -> Scroll to bottom on tty output (rxvt).
//     Ps = 1 0 1 1  -> Scroll to bottom on key press (rxvt).
//     Ps = 1 0 3 4  -> Interpret "meta" key, sets eighth bit.
//     (enables the eightBitInput resource).
//     Ps = 1 0 3 5  -> Enable special modifiers for Alt and Num-
//     Lock keys.  (This enables the numLock resource).
//     Ps = 1 0 3 6  -> Send ESC   when Meta modifies a key.  (This
//     enables the metaSendsEscape resource).
//     Ps = 1 0 3 7  -> Send DEL from the editing-keypad Delete
//     key.
//     Ps = 1 0 3 9  -> Send ESC  when Alt modifies a key.  (This
//     enables the altSendsEscape resource).
//     Ps = 1 0 4 0  -> Keep selection even if not highlighted.
//     (This enables the keepSelection resource).
//     Ps = 1 0 4 1  -> Use the CLIPBOARD selection.  (This enables
//     the selectToClipboard resource).
//     Ps = 1 0 4 2  -> Enable Urgency window manager hint when
//     Control-G is received.  (This enables the bellIsUrgent
//     resource).
//     Ps = 1 0 4 3  -> Enable raising of the window when Control-G
//     is received.  (enables the popOnBell resource).
//     Ps = 1 0 4 7  -> Use Alternate Screen Buffer.  (This may be
//     disabled by the titeInhibit resource).
//     Ps = 1 0 4 8  -> Save cursor as in DECSC.  (This may be dis-
//     abled by the titeInhibit resource).
//     Ps = 1 0 4 9  -> Save cursor as in DECSC and use Alternate
//     Screen Buffer, clearing it first.  (This may be disabled by
//     the titeInhibit resource).  This combines the effects of the 1
//     0 4 7  and 1 0 4 8  modes.  Use this with terminfo-based
//     applications rather than the 4 7  mode.
//     Ps = 1 0 5 0  -> Set terminfo/termcap function-key mode.
//     Ps = 1 0 5 1  -> Set Sun function-key mode.
//     Ps = 1 0 5 2  -> Set HP function-key mode.
//     Ps = 1 0 5 3  -> Set SCO function-key mode.
//     Ps = 1 0 6 0  -> Set legacy keyboard emulation (X11R6).
//     Ps = 1 0 6 1  -> Set VT220 keyboard emulation.
//     Ps = 2 0 0 4  -> Set bracketed paste mode.
Term.prototype.setMode = function(params) {
  if (typeof params === 'object') {
    while (params.length) this.setMode(params.shift());
    return;
  }

  if (this.prefix !== '?') {
    switch (params) {
      case 20:
        //this.convertEol = true;
        break;
    }
  } else {
    switch (params) {
      case 25: // show cursor
        this.cursorHidden = false;
        break;
      case 1049: // alt screen buffer cursor
        //this.saveCursor();
        ; // FALL-THROUGH
      case 47: // alt screen buffer
      case 1047: // alt screen buffer
        if (!this.normal) {
          this.normal = {};
          this.normal.lines = this.lines;
          this.normal.currentHeight = this.currentHeight;
          this.normal.ybase = this.ybase;
          this.normal.ydisp = this.ydisp;
          this.normal.x = this.x;
          this.normal.y = this.y;
          this.normal.scrollTop = this.scrollTop;
          this.normal.scrollBottom = this.scrollBottom;
          this.reset();
        }
        break;
    }
  }
};

// CSI Pm l  Reset Mode (RM).
//     Ps = 2  -> Keyboard Action Mode (AM).
//     Ps = 4  -> Replace Mode (IRM).
//     Ps = 1 2  -> Send/receive (SRM).
//     Ps = 2 0  -> Normal Linefeed (LNM).
// CSI ? Pm l
//   DEC Private Mode Reset (DECRST).
//     Ps = 1  -> Normal Cursor Keys (DECCKM).
//     Ps = 2  -> Designate VT52 mode (DECANM).
//     Ps = 3  -> 80 Column Mode (DECCOLM).
//     Ps = 4  -> Jump (Fast) Scroll (DECSCLM).
//     Ps = 5  -> Normal Video (DECSCNM).
//     Ps = 6  -> Normal Cursor Mode (DECOM).
//     Ps = 7  -> No Wraparound Mode (DECAWM).
//     Ps = 8  -> No Auto-repeat Keys (DECARM).
//     Ps = 9  -> Don't send Mouse X & Y on button press.
//     Ps = 1 0  -> Hide toolbar (rxvt).
//     Ps = 1 2  -> Stop Blinking Cursor (att610).
//     Ps = 1 8  -> Don't print form feed (DECPFF).
//     Ps = 1 9  -> Limit print to scrolling region (DECPEX).
//     Ps = 2 5  -> Hide Cursor (DECTCEM).
//     Ps = 3 0  -> Don't show scrollbar (rxvt).
//     Ps = 3 5  -> Disable font-shifting functions (rxvt).
//     Ps = 4 0  -> Disallow 80 -> 132 Mode.
//     Ps = 4 1  -> No more(1) fix (see curses resource).
//     Ps = 4 2  -> Disable Nation Replacement Character sets (DEC-
//     NRCM).
//     Ps = 4 4  -> Turn Off Margin Bell.
//     Ps = 4 5  -> No Reverse-wraparound Mode.
//     Ps = 4 6  -> Stop Logging.  (This is normally disabled by a
//     compile-time option).
//     Ps = 4 7  -> Use Normal Screen Buffer.
//     Ps = 6 6  -> Numeric keypad (DECNKM).
//     Ps = 6 7  -> Backarrow key sends delete (DECBKM).
//     Ps = 1 0 0 0  -> Don't send Mouse X & Y on button press and
//     release.  See the section Mouse Tracking.
//     Ps = 1 0 0 1  -> Don't use Hilite Mouse Tracking.
//     Ps = 1 0 0 2  -> Don't use Cell Motion Mouse Tracking.
//     Ps = 1 0 0 3  -> Don't use All Motion Mouse Tracking.
//     Ps = 1 0 0 4  -> Don't send FocusIn/FocusOut events.
//     Ps = 1 0 0 5  -> Disable Extended Mouse Mode.
//     Ps = 1 0 1 0  -> Don't scroll to bottom on tty output
//     (rxvt).
//     Ps = 1 0 1 1  -> Don't scroll to bottom on key press (rxvt).
//     Ps = 1 0 3 4  -> Don't interpret "meta" key.  (This disables
//     the eightBitInput resource).
//     Ps = 1 0 3 5  -> Disable special modifiers for Alt and Num-
//     Lock keys.  (This disables the numLock resource).
//     Ps = 1 0 3 6  -> Don't send ESC  when Meta modifies a key.
//     (This disables the metaSendsEscape resource).
//     Ps = 1 0 3 7  -> Send VT220 Remove from the editing-keypad
//     Delete key.
//     Ps = 1 0 3 9  -> Don't send ESC  when Alt modifies a key.
//     (This disables the altSendsEscape resource).
//     Ps = 1 0 4 0  -> Do not keep selection when not highlighted.
//     (This disables the keepSelection resource).
//     Ps = 1 0 4 1  -> Use the PRIMARY selection.  (This disables
//     the selectToClipboard resource).
//     Ps = 1 0 4 2  -> Disable Urgency window manager hint when
//     Control-G is received.  (This disables the bellIsUrgent
//     resource).
//     Ps = 1 0 4 3  -> Disable raising of the window when Control-
//     G is received.  (This disables the popOnBell resource).
//     Ps = 1 0 4 7  -> Use Normal Screen Buffer, clearing screen
//     first if in the Alternate Screen.  (This may be disabled by
//     the titeInhibit resource).
//     Ps = 1 0 4 8  -> Restore cursor as in DECRC.  (This may be
//     disabled by the titeInhibit resource).
//     Ps = 1 0 4 9  -> Use Normal Screen Buffer and restore cursor
//     as in DECRC.  (This may be disabled by the titeInhibit
//     resource).  This combines the effects of the 1 0 4 7  and 1 0
//     4 8  modes.  Use this with terminfo-based applications rather
//     than the 4 7  mode.
//     Ps = 1 0 5 0  -> Reset terminfo/termcap function-key mode.
//     Ps = 1 0 5 1  -> Reset Sun function-key mode.
//     Ps = 1 0 5 2  -> Reset HP function-key mode.
//     Ps = 1 0 5 3  -> Reset SCO function-key mode.
//     Ps = 1 0 6 0  -> Reset legacy keyboard emulation (X11R6).
//     Ps = 1 0 6 1  -> Reset keyboard emulation to Sun/PC style.
//     Ps = 2 0 0 4  -> Reset bracketed paste mode.
Term.prototype.resetMode = function(params) {
  if (typeof params === 'object') {
    while (params.length) this.resetMode(params.shift());
    return;
  }

  if (this.prefix !== '?') {
    switch (params) {
      case 20:
        //this.convertEol = false;
        break;
    }
  } else {
    switch (params) {
      case 25: // hide cursor
        this.cursorHidden = true;
        break;
      case 1049: // alt screen buffer cursor
        ; // FALL-THROUGH
      case 47: // normal screen buffer
      case 1047: // normal screen buffer - clearing it first
        if (this.normal) {
          this.lines = this.normal.lines;
          this.currentHeight = this.normal.currentHeight;
          this.ybase = this.normal.ybase;
          this.ydisp = this.normal.ydisp;
          this.x = this.normal.x;
          this.y = this.normal.y;
          this.scrollTop = this.normal.scrollTop;
          this.scrollBottom = this.normal.scrollBottom;
          this.normal = null;
          // if (params === 1049) {
          //   this.x = this.savedX;
          //   this.y = this.savedY;
          // }
          this.refresh(0, this.rows - 1);
        }
        break;
    }
  }
};

// CSI Ps ; Ps r
//   Set Scrolling Region [top;bottom] (default = full size of win-
//   dow) (DECSTBM).
// CSI ? Pm r
Term.prototype.setScrollRegion = function(params) {
  if (this.prefix === '?') return;
  this.scrollTop = (this.params[0] || 1) - 1;
  this.scrollBottom = (this.params[1] || this.rows) - 1;
};

// CSI s     Save cursor (ANSI.SYS).
Term.prototype.saveCursor = function(params) {
  this.savedX = this.x;
  this.savedY = this.y;
};

// CSI u     Restore cursor (ANSI.SYS).
Term.prototype.restoreCursor = function(params) {
  this.x = this.savedX || 0;
  this.y = this.savedY || 0;
};

/**
 * Lesser Used
 */

// CSI Ps I  Cursor Forward Tabulation Ps tab stops (default = 1) (CHT).
Term.prototype.cursorForwardTab = function(params) {
  this.insertChars([param * 8]);
};

// CSI Ps S  Scroll up Ps lines (default = 1) (SU).
Term.prototype.scrollUp = function(params) {
  this.scrollDisp(-params[0] || -1);
};

// CSI Ps T  Scroll down Ps lines (default = 1) (SD).
Term.prototype.scrollDown = function(params) {
  this.scrollDisp(params[0] || 1);
};

// CSI Ps ; Ps ; Ps ; Ps ; Ps T
//   Initiate highlight mouse tracking.  Parameters are
//   [func;startx;starty;firstrow;lastrow].  See the section Mouse
//   Tracking.
Term.prototype.initMouseTracking = function(params) {
};

// CSI > Ps; Ps T
//   Reset one or more features of the title modes to the default
//   value.  Normally, "reset" disables the feature.  It is possi-
//   ble to disable the ability to reset features by compiling a
//   different default for the title modes into xterm.
//     Ps = 0  -> Do not set window/icon labels using hexadecimal.
//     Ps = 1  -> Do not query window/icon labels using hexadeci-
//     mal.
//     Ps = 2  -> Do not set window/icon labels using UTF-8.
//     Ps = 3  -> Do not query window/icon labels using UTF-8.
//   (See discussion of "Title Modes").
Term.prototype.resetTitleModes = function(params) {
};

// CSI Ps Z  Cursor Backward Tabulation Ps tab stops (default = 1) (CBT).
Term.prototype.cursorBackwardTab = function(params) {
  var row, param, line, ch;

  param = params[0] || 1;
  param = param * 8;
  row = this.y + this.ybase;
  line = this.lines[row];
  ch = (this.defAttr << 16) | 32;

  while (param--) {
    if (this.x !== 0) {
      line.splice(--this.x, 1);
      line.push(ch);
    } else {
      //line.shift();
      //line.push(ch);
      break;
    }
  }
};

// CSI Ps b  Repeat the preceding graphic character Ps times (REP).
Term.prototype.repeatPrecedingCharacter = function(params) {
};

// CSI Ps g  Tab Clear (TBC).
//     Ps = 0  -> Clear Current Column (default).
//     Ps = 3  -> Clear All.
Term.prototype.tabClear = function(params) {
};

// CSI Pm i  Media Copy (MC).
//     Ps = 0  -> Print screen (default).
//     Ps = 4  -> Turn off printer controller mode.
//     Ps = 5  -> Turn on printer controller mode.
// CSI ? Pm i
//   Media Copy (MC, DEC-specific).
//     Ps = 1  -> Print line containing cursor.
//     Ps = 4  -> Turn off autoprint mode.
//     Ps = 5  -> Turn on autoprint mode.
//     Ps = 1  0  -> Print composed display, ignores DECPEX.
//     Ps = 1  1  -> Print all pages.
Term.prototype.mediaCopy = function(params) {
};

// CSI > Ps; Ps m
//   Set or reset resource-values used by xterm to decide whether
//   to construct escape sequences holding information about the
//   modifiers pressed with a given key.  The first parameter iden-
//   tifies the resource to set/reset.  The second parameter is the
//   value to assign to the resource.  If the second parameter is
//   omitted, the resource is reset to its initial value.
//     Ps = 1  -> modifyCursorKeys.
//     Ps = 2  -> modifyFunctionKeys.
//     Ps = 4  -> modifyOtherKeys.
//   If no parameters are given, all resources are reset to their
//   initial values.
Term.prototype.setResources = function(params) {
};

// CSI > Ps n
//   Disable modifiers which may be enabled via the CSI > Ps; Ps m
//   sequence.  This corresponds to a resource value of "-1", which
//   cannot be set with the other sequence.  The parameter identi-
//   fies the resource to be disabled:
//     Ps = 1  -> modifyCursorKeys.
//     Ps = 2  -> modifyFunctionKeys.
//     Ps = 4  -> modifyOtherKeys.
//   If the parameter is omitted, modifyFunctionKeys is disabled.
//   When modifyFunctionKeys is disabled, xterm uses the modifier
//   keys to make an extended sequence of functions rather than
//   adding a parameter to each function key to denote the modi-
//   fiers.
Term.prototype.disableModifiers = function(params) {
};

// CSI > Ps p
//   Set resource value pointerMode.  This is used by xterm to
//   decide whether to hide the pointer cursor as the user types.
//   Valid values for the parameter:
//     Ps = 0  -> never hide the pointer.
//     Ps = 1  -> hide if the mouse tracking mode is not enabled.
//     Ps = 2  -> always hide the pointer.  If no parameter is
//     given, xterm uses the default, which is 1 .
Term.prototype.setPointerMode = function(params) {
};

// CSI ! p   Soft terminal reset (DECSTR).
Term.prototype.softReset = function(params) {
  this.reset();
};

// CSI Ps$ p
//   Request ANSI mode (DECRQM).  For VT300 and up, reply is
//     CSI Ps; Pm$ y
//   where Ps is the mode number as in RM, and Pm is the mode
//   value:
//     0 - not recognized
//     1 - set
//     2 - reset
//     3 - permanently set
//     4 - permanently reset
Term.prototype.requestAnsiMode = function(params) {
};

// CSI ? Ps$ p
//   Request DEC private mode (DECRQM).  For VT300 and up, reply is
//     CSI ? Ps; Pm$ p
//   where Ps is the mode number as in DECSET, Pm is the mode value
//   as in the ANSI DECRQM.
Term.prototype.requestPrivateMode = function(params) {
};

// CSI Ps ; Ps " p
//   Set conformance level (DECSCL).  Valid values for the first
//   parameter:
//     Ps = 6 1  -> VT100.
//     Ps = 6 2  -> VT200.
//     Ps = 6 3  -> VT300.
//   Valid values for the second parameter:
//     Ps = 0  -> 8-bit controls.
//     Ps = 1  -> 7-bit controls (always set for VT100).
//     Ps = 2  -> 8-bit controls.
Term.prototype.setConformanceLevel = function(params) {
};

// CSI Ps q  Load LEDs (DECLL).
//     Ps = 0  -> Clear all LEDS (default).
//     Ps = 1  -> Light Num Lock.
//     Ps = 2  -> Light Caps Lock.
//     Ps = 3  -> Light Scroll Lock.
//     Ps = 2  1  -> Extinguish Num Lock.
//     Ps = 2  2  -> Extinguish Caps Lock.
//     Ps = 2  3  -> Extinguish Scroll Lock.
Term.prototype.loadLEDs = function(params) {
};

// CSI Ps SP q
//   Set cursor style (DECSCUSR, VT520).
//     Ps = 0  -> blinking block.
//     Ps = 1  -> blinking block (default).
//     Ps = 2  -> steady block.
//     Ps = 3  -> blinking underline.
//     Ps = 4  -> steady underline.
Term.prototype.setCursorStyle = function(params) {
};

// CSI Ps " q
//   Select character protection attribute (DECSCA).  Valid values
//   for the parameter:
//     Ps = 0  -> DECSED and DECSEL can erase (default).
//     Ps = 1  -> DECSED and DECSEL cannot erase.
//     Ps = 2  -> DECSED and DECSEL can erase.
Term.prototype.setCharProtectionAttr = function(params) {
};

// CSI ? Pm r
//   Restore DEC Private Mode Values.  The value of Ps previously
//   saved is restored.  Ps values are the same as for DECSET.
Term.prototype.restorePrivateValues = function(params) {
};

// CSI Pt; Pl; Pb; Pr; Ps$ r
//   Change Attributes in Rectangular Area (DECCARA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Ps denotes the SGR attributes to change: 0, 1, 4, 5, 7.
Term.prototype.setAttrInRectangle = function(params) {
};

// CSI ? Pm s
//   Save DEC Private Mode Values.  Ps values are the same as for
//   DECSET.
Term.prototype.savePrivateValues = function(params) {
};

// CSI Ps ; Ps ; Ps t
//   Window manipulation (from dtterm, as well as extensions).
//   These controls may be disabled using the allowWindowOps
//   resource.  Valid values for the first (and any additional
//   parameters) are:
//     Ps = 1  -> De-iconify window.
//     Ps = 2  -> Iconify window.
//     Ps = 3  ;  x ;  y -> Move window to [x, y].
//     Ps = 4  ;  height ;  width -> Resize the xterm window to
//     height and width in pixels.
//     Ps = 5  -> Raise the xterm window to the front of the stack-
//     ing order.
//     Ps = 6  -> Lower the xterm window to the bottom of the
//     stacking order.
//     Ps = 7  -> Refresh the xterm window.
//     Ps = 8  ;  height ;  width -> Resize the text area to
//     [height;width] in characters.
//     Ps = 9  ;  0  -> Restore maximized window.
//     Ps = 9  ;  1  -> Maximize window (i.e., resize to screen
//     size).
//     Ps = 1 0  ;  0  -> Undo full-screen mode.
//     Ps = 1 0  ;  1  -> Change to full-screen.
//     Ps = 1 1  -> Report xterm window state.  If the xterm window
//     is open (non-iconified), it returns CSI 1 t .  If the xterm
//     window is iconified, it returns CSI 2 t .
//     Ps = 1 3  -> Report xterm window position.  Result is CSI 3
//     ; x ; y t
//     Ps = 1 4  -> Report xterm window in pixels.  Result is CSI
//     4  ;  height ;  width t
//     Ps = 1 8  -> Report the size of the text area in characters.
//     Result is CSI  8  ;  height ;  width t
//     Ps = 1 9  -> Report the size of the screen in characters.
//     Result is CSI  9  ;  height ;  width t
//     Ps = 2 0  -> Report xterm window's icon label.  Result is
//     OSC  L  label ST
//     Ps = 2 1  -> Report xterm window's title.  Result is OSC  l
//     label ST
//     Ps = 2 2  ;  0  -> Save xterm icon and window title on
//     stack.
//     Ps = 2 2  ;  1  -> Save xterm icon title on stack.
//     Ps = 2 2  ;  2  -> Save xterm window title on stack.
//     Ps = 2 3  ;  0  -> Restore xterm icon and window title from
//     stack.
//     Ps = 2 3  ;  1  -> Restore xterm icon title from stack.
//     Ps = 2 3  ;  2  -> Restore xterm window title from stack.
//     Ps >= 2 4  -> Resize to Ps lines (DECSLPP).
Term.prototype.manipulateWindow = function(params) {
};

// CSI Pt; Pl; Pb; Pr; Ps$ t
//   Reverse Attributes in Rectangular Area (DECRARA), VT400 and
//   up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Ps denotes the attributes to reverse, i.e.,  1, 4, 5, 7.
Term.prototype.reverseAttrInRectangle = function(params) {
};

// CSI > Ps; Ps t
//   Set one or more features of the title modes.  Each parameter
//   enables a single feature.
//     Ps = 0  -> Set window/icon labels using hexadecimal.
//     Ps = 1  -> Query window/icon labels using hexadecimal.
//     Ps = 2  -> Set window/icon labels using UTF-8.
//     Ps = 3  -> Query window/icon labels using UTF-8.  (See dis-
//     cussion of "Title Modes")
Term.prototype.setTitleModeFeature = function(params) {
};

// CSI Ps SP t
//   Set warning-bell volume (DECSWBV, VT520).
//     Ps = 0  or 1  -> off.
//     Ps = 2 , 3  or 4  -> low.
//     Ps = 5 , 6 , 7 , or 8  -> high.
Term.prototype.setWarningBellVolume = function(params) {
};

// CSI Ps SP u
//   Set margin-bell volume (DECSMBV, VT520).
//     Ps = 1  -> off.
//     Ps = 2 , 3  or 4  -> low.
//     Ps = 0 , 5 , 6 , 7 , or 8  -> high.
Term.prototype.setMarginBellVolume = function(params) {
};

// CSI Pt; Pl; Pb; Pr; Pp; Pt; Pl; Pp$ v
//   Copy Rectangular Area (DECCRA, VT400 and up).
//     Pt; Pl; Pb; Pr denotes the rectangle.
//     Pp denotes the source page.
//     Pt; Pl denotes the target location.
//     Pp denotes the target page.
Term.prototype.copyRectangle = function(params) {
};

// CSI Pt ; Pl ; Pb ; Pr ' w
//   Enable Filter Rectangle (DECEFR), VT420 and up.
//   Parameters are [top;left;bottom;right].
//   Defines the coordinates of a filter rectangle and activates
//   it.  Anytime the locator is detected outside of the filter
//   rectangle, an outside rectangle event is generated and the
//   rectangle is disabled.  Filter rectangles are always treated
//   as "one-shot" events.  Any parameters that are omitted default
//   to the current locator position.  If all parameters are omit-
//   ted, any locator motion will be reported.  DECELR always can-
//   cels any prevous rectangle definition.
Term.prototype.enableFilterRectangle = function(params) {
};

// CSI Ps x  Request Terminal Parameters (DECREQTPARM).
//   if Ps is a "0" (default) or "1", and xterm is emulating VT100,
//   the control sequence elicits a response of the same form whose
//   parameters describe the terminal:
//     Ps -> the given Ps incremented by 2.
//     Pn = 1  <- no parity.
//     Pn = 1  <- eight bits.
//     Pn = 1  <- 2  8  transmit 38.4k baud.
//     Pn = 1  <- 2  8  receive 38.4k baud.
//     Pn = 1  <- clock multiplier.
//     Pn = 0  <- STP flags.
Term.prototype.requestParameters = function(params) {
};

// CSI Ps x  Select Attribute Change Extent (DECSACE).
//     Ps = 0  -> from start to end position, wrapped.
//     Ps = 1  -> from start to end position, wrapped.
//     Ps = 2  -> rectangle (exact).
Term.prototype.__ = function(params) {
};

// CSI Pc; Pt; Pl; Pb; Pr$ x
//   Fill Rectangular Area (DECFRA), VT420 and up.
//     Pc is the character to use.
//     Pt; Pl; Pb; Pr denotes the rectangle.
Term.prototype.fillRectangle = function(params) {
};

// CSI Ps ; Pu ' z
//   Enable Locator Reporting (DECELR).
//   Valid values for the first parameter:
//     Ps = 0  -> Locator disabled (default).
//     Ps = 1  -> Locator enabled.
//     Ps = 2  -> Locator enabled for one report, then disabled.
//   The second parameter specifies the coordinate unit for locator
//   reports.
//   Valid values for the second parameter:
//     Pu = 0  <- or omitted -> default to character cells.
//     Pu = 1  <- device physical pixels.
//     Pu = 2  <- character cells.
Term.prototype.enableLocatorReporting = function(params) {
};

// CSI Pt; Pl; Pb; Pr$ z
//   Erase Rectangular Area (DECERA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
Term.prototype.eraseRectangle = function(params) {
};

// CSI Pm ' {
//   Select Locator Events (DECSLE).
//   Valid values for the first (and any additional parameters)
//   are:
//     Ps = 0  -> only respond to explicit host requests (DECRQLP).
//                (This is default).  It also cancels any filter
//   rectangle.
//     Ps = 1  -> report button down transitions.
//     Ps = 2  -> do not report button down transitions.
//     Ps = 3  -> report button up transitions.
//     Ps = 4  -> do not report button up transitions.
Term.prototype.setLocatorEvents = function(params) {
};

// CSI Pt; Pl; Pb; Pr$ {
//   Selective Erase Rectangular Area (DECSERA), VT400 and up.
//     Pt; Pl; Pb; Pr denotes the rectangle.
Term.prototype.selectiveEraseRectangle = function(params) {
};

// CSI Ps ' |
//   Request Locator Position (DECRQLP).
//   Valid values for the parameter are:
//     Ps = 0 , 1 or omitted -> transmit a single DECLRP locator
//     report.

//   If Locator Reporting has been enabled by a DECELR, xterm will
//   respond with a DECLRP Locator Report.  This report is also
//   generated on button up and down events if they have been
//   enabled with a DECSLE, or when the locator is detected outside
//   of a filter rectangle, if filter rectangles have been enabled
//   with a DECEFR.

//     -> CSI Pe ; Pb ; Pr ; Pc ; Pp &  w

//   Parameters are [event;button;row;column;page].
//   Valid values for the event:
//     Pe = 0  -> locator unavailable - no other parameters sent.
//     Pe = 1  -> request - xterm received a DECRQLP.
//     Pe = 2  -> left button down.
//     Pe = 3  -> left button up.
//     Pe = 4  -> middle button down.
//     Pe = 5  -> middle button up.
//     Pe = 6  -> right button down.
//     Pe = 7  -> right button up.
//     Pe = 8  -> M4 button down.
//     Pe = 9  -> M4 button up.
//     Pe = 1 0  -> locator outside filter rectangle.
//   ``button'' parameter is a bitmask indicating which buttons are
//     pressed:
//     Pb = 0  <- no buttons down.
//     Pb & 1  <- right button down.
//     Pb & 2  <- middle button down.
//     Pb & 4  <- left button down.
//     Pb & 8  <- M4 button down.
//   ``row'' and ``column'' parameters are the coordinates of the
//     locator position in the xterm window, encoded as ASCII deci-
//     mal.
//   The ``page'' parameter is not used by xterm, and will be omit-
//   ted.
Term.prototype.requestLocatorPosition = function(params) {
};


/**
 * Expose
 */

this.Term = Term;

}).call(this);
