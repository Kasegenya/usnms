
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { User, HelperStatusLog } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { SystemLogs } from "@/utils/systemLogs";
import { 
  CheckCircle, 
  XCircle, 
  PauseCircle, 
  ClockIcon, 
  Filter,
  UserCheck,
  Download
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const HelperStatusTracking = () => {
  const [helpers, setHelpers] = useState<User[]>([]);
  const [statusLogs, setStatusLogs] = useState<HelperStatusLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHelper, setSelectedHelper] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<'active' | 'completed' | 'inactive'>('active');
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'inactive'>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch all helpers with specific columns
        const { data: helpersData, error: helpersError } = await supabase
          .from('users')
          .select('id, first_name, last_name, email, role, status, created_at, updated_at')
          .eq('role', 'helper')
          .order('first_name', { ascending: true });
          
        if (helpersError) {
          console.error('Error fetching helpers:', helpersError);
          throw helpersError;
        }
        
        setHelpers(helpersData || []);
        
        try {
          // Fetch all status logs
          const { data: logsData, error: logsError } = await supabase
            .from('helper_status_logs')
            .select('*')
            .order('changed_at', { ascending: false });
            
          if (logsError) {
            // If table doesn't exist, just set empty array
            if (logsError.code === '42P01') {
              setStatusLogs([]);
              return;
            }
            throw logsError;
          }
          
          setStatusLogs(logsData || []);
        } catch (error) {
          console.error('Error fetching status logs:', error);
          // If status logs fail to load, we can still show helpers
          setStatusLogs([]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: "Error",
          description: "Failed to load helper data. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  const updateHelperStatus = async () => {
    if (!selectedHelper || !newStatus) {
      toast({
        title: "Missing Information",
        description: "Please select a helper and status.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      // Update the helper status
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedHelper);
        
      if (updateError) throw updateError;
      
      try {
        // Try to create a status log
        const { error: logError } = await supabase
          .from('helper_status_logs')
          .insert([{
            helper_id: selectedHelper,
            status: newStatus,
            notes: notes,
            changed_at: new Date().toISOString(),
            changed_by: "admin" // This should be the current user's ID
          }]);
          
        if (logError && logError.code !== '42P01') throw logError;
      } catch (error) {
        console.error('Error creating status log:', error);
        // Continue even if logging fails
      }
      
      // Update local state
      setHelpers(helpers.map(helper => 
        helper.id === selectedHelper 
          ? { ...helper, status: newStatus, updated_at: new Date().toISOString() } 
          : helper
      ));
      
      const newLog: HelperStatusLog = {
        helper_id: selectedHelper,
        status: newStatus,
        notes: notes,
        changed_at: new Date().toISOString(),
        changed_by: "admin"
      };
      
      setStatusLogs([newLog, ...statusLogs]);
      
      // Clear form
      setNotes("");
      
      // Log the action
      SystemLogs.addLog(
        "Helper Status Update",
        `Helper ${selectedHelper} status updated to ${newStatus}`,
        "admin",
        "admin"
      );
      
      toast({
        title: "Status Updated",
        description: "Helper status has been updated successfully.",
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Error",
        description: "Failed to update helper status. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" /> Active</Badge>;
      case 'completed':
        return <Badge variant="secondary"><ClockIcon className="h-3 w-3 mr-1" /> Completed</Badge>;
      case 'inactive':
        return <Badge variant="destructive"><PauseCircle className="h-3 w-3 mr-1" /> Inactive</Badge>;
      default:
        return <Badge variant="outline"><XCircle className="h-3 w-3 mr-1" /> Unknown</Badge>;
    }
  };

  const downloadStatusReport = () => {
    const selectedLogs = filter === 'all' 
      ? statusLogs 
      : statusLogs.filter(log => log.status === filter);
    
    const helperMap = helpers.reduce((map, helper) => {
      map[helper.id] = `${helper.first_name} ${helper.last_name}`;
      return map;
    }, {} as Record<string, string>);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Helper,Status,Changed Date,Notes\n"
      + selectedLogs.map(log => {
          const helperName = helperMap[log.helper_id] || log.helper_id;
          return `"${helperName}","${log.status}","${format(new Date(log.changed_at), 'yyyy-MM-dd HH:mm')}","${log.notes || ''}"`
        }).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `helper_status_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const filteredLogs = filter === 'all' 
    ? statusLogs 
    : statusLogs.filter(log => log.status === filter);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between">
            <div className="flex items-center">
              <UserCheck className="h-5 w-5 mr-2" />
              Helper Status Management
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={downloadStatusReport}
              className="flex items-center"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Report
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="text-sm font-medium mb-1 block">Helper</label>
              <Select value={selectedHelper || ''} onValueChange={setSelectedHelper}>
                <SelectTrigger>
                  <SelectValue placeholder="Select helper" />
                </SelectTrigger>
                <SelectContent>
                  {helpers.map((helper) => (
                    <SelectItem key={helper.id} value={helper.id}>
                      {helper.first_name} {helper.last_name} {helper.status && `(${helper.status})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">New Status</label>
              <Select value={newStatus} onValueChange={(value: 'active' | 'completed' | 'inactive') => setNewStatus(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <Input
                placeholder="Add optional notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={updateHelperStatus}>Update Status</Button>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between">
            <span>Status History</span>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <Select value={filter} onValueChange={(value: 'all' | 'active' | 'completed' | 'inactive') => setFilter(value)}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-4">Loading status history...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Helper</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Changed Date</TableHead>
                    <TableHead>Changed By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length > 0 ? (
                    filteredLogs.map((log, index) => {
                      const helper = helpers.find(h => h.id === log.helper_id);
                      return (
                        <TableRow key={index}>
                          <TableCell>
                            {helper ? `${helper.first_name} ${helper.last_name}` : log.helper_id}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(log.status)}
                          </TableCell>
                          <TableCell>
                            {format(new Date(log.changed_at), 'yyyy-MM-dd HH:mm')}
                          </TableCell>
                          <TableCell>
                            {log.changed_by || 'System'}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {log.notes || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No status history found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HelperStatusTracking;
