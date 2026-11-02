-- Allow members to read and write their own attendance records
CREATE POLICY "members own attendance"
  ON attendance
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM members
      WHERE members.id = attendance.member_id
        AND members.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members
      WHERE members.id = attendance.member_id
        AND members.auth_user_id = auth.uid()
    )
  );
