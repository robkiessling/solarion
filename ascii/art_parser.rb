# TODO convert this to a node script

# ----------------------------------------------------------------------------------------------------------------------
#
# Generates txt files that can be cut-and-pasted into a javascript file.
# - Certain characters will be escaped (e.g. \ and ')
# - Each line will be surrounded by single quotes, and all but the last line will end in a comma
# - Strings can be set to the same length with the -l option
#
# E.g. if your source file is:
#
# ~O
# / \
# \+---
#  |\
#  /|
#
# And you run:
#
#   ruby ascii_art/art_parser.rb -f source.txt
#
# An output.txt file will be generated with strings:
#
# '~O',
# '/ \\',
# '\\+---',
# ' |\\',
# ' /|'
#
# ----------------------------------------------------------------------------------------------------------------------

require 'optparse'

options = {}
OptionParser.new do |opts|
  opts.banner = "Usage: art_parser.rb [options]"

  opts.on('-f', '--file FILE', String, 'Source file') do |v|
    options[:file] = v
  end

  opts.on('-l', '--length LENGTH', Integer, 'Line Length (for r-padding)') do |v|
    options[:length] = v
  end

  opts.on("-h", "--help", "Prints this help") do
    puts opts
    exit
  end
end.parse!

lines = []

File.open(File.dirname(__FILE__) + '/' + options[:file], 'r') do |file|
  file.each_line do |line|
    line = line.gsub(/\n/, '') # remove \n from reading the file
    line = line.slice(0...options[:length]).ljust(options[:length], ' ') if options[:length] # pad to length if needed
    line = line.gsub(/\\/, '\\\\\\') # escape \ characters since they are the escape character
    line = line.gsub(/'/, "\\\\'") # escape ' characters since they interfere with string boundaries
    lines << line
  end
end

File.open(File.dirname(__FILE__) + '/' + 'output.txt', 'w') do |file|
  lines.each_with_index do |line, index|
    file.puts "'#{line}'#{',' if index < lines.length - 1}" # add single quotes around line, add comma if not last line
  end
end

